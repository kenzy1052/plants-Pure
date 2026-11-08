import crypto from "node:crypto";
import pg from "pg";
import { buildTestDatabase } from "../../scripts/db/lib.mjs";

export const ADMIN_URL = process.env.TEST_DATABASE_URL;
export const hasDb = Boolean(ADMIN_URL);

export type TestDb = {
  url: string;
  name: string;
  drop(): Promise<void>;
  /** superuser connection: bypasses RLS, used for fixtures and "trusted" actions */
  su: pg.Client;
  newClient(): Promise<pg.Client>;
};

export async function setupDb(): Promise<TestDb> {
  const built = await buildTestDatabase(ADMIN_URL!);
  const su = new pg.Client({ connectionString: built.url });
  await su.connect();
  const clients: pg.Client[] = [su];
  return {
    ...built,
    su,
    async newClient() {
      const c = new pg.Client({ connectionString: built.url });
      await c.connect();
      clients.push(c);
      return c;
    },
    async drop() {
      await Promise.all(clients.map((c) => c.end().catch(() => undefined)));
      await built.drop();
    },
  };
}

export type Who =
  | { role: "anon" }
  | { role: "authenticated"; sub: string }
  | { role: "service_role" };

async function enter(c: pg.Client, who: Who) {
  await c.query("begin");
  await c.query(`set local role ${who.role}`);
  const claims: Record<string, string> = { role: who.role };
  if ("sub" in who) claims.sub = who.sub;
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
}

/** Run `fn` as a Supabase API role, then ROLL BACK (nothing persists). */
export async function asRole<T>(c: pg.Client, who: Who, fn: () => Promise<T>): Promise<T> {
  await enter(c, who);
  try {
    return await fn();
  } finally {
    await c.query("rollback");
  }
}

/** Run `fn` as a Supabase API role and COMMIT (for multi-step server flows). */
export async function commitAs<T>(c: pg.Client, who: Who, fn: () => Promise<T>): Promise<T> {
  await enter(c, who);
  try {
    const r = await fn();
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

/** Expect a Postgres error with the given SQLSTATE (and optional message fragment). */
export async function expectPgError(p: Promise<unknown>, code: string, msg?: string) {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code !== code) {
      throw new Error(`expected SQLSTATE ${code}, got ${err.code}: ${err.message}`);
    }
    if (msg && !String(err.message).includes(msg)) {
      throw new Error(`expected message to include "${msg}", got: ${err.message}`);
    }
    return err;
  }
  throw new Error(`expected SQLSTATE ${code}, but the statement succeeded`);
}

export const uuid = () => crypto.randomUUID();

export async function createUser(
  su: pg.Client,
  opts: { email?: string; meta?: Record<string, unknown> } = {},
): Promise<string> {
  const id = uuid();
  await su.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, opts.email ?? `${id.slice(0, 8)}@example.test`, JSON.stringify(opts.meta ?? {})],
  );
  return id;
}

export async function makeRole(su: pg.Client, userId: string, role: "admin" | "dispatch" | "customer") {
  // Trusted path (SQL editor / migration role).
  await su.query("update public.profiles set role = $2::public.user_role where id = $1", [userId, role]);
}


/**
 * Insert a product the way the publication rules require: as a draft, then a cover
 * image, then publish. (A product with no cover image cannot be published.)
 */
export async function insertProduct(
  su: pg.Client,
  o: { categoryId?: string | null; title?: string; slug: string; price?: string | number; stock?: number; sku?: string | null; published?: boolean; description?: string },
): Promise<string> {
  const r = await su.query(
    `insert into public.products (category_id, title, slug, description, price, stock, sku)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [o.categoryId ?? null, o.title ?? `Test ${o.slug}`, o.slug, o.description ?? "test description", o.price ?? 10, o.stock ?? 0, o.sku ?? null],
  );
  const id = r.rows[0].id as string;
  if (o.published ?? true) {
    await addTestImage(su, id);
    await su.query("update public.products set is_active = true where id = $1", [id]);
  }
  return id;
}

let imageCounter = 0;
export async function addTestImage(su: pg.Client, productId: string, cover?: boolean) {
  const n = ++imageCounter;
  const isCover = cover ?? !(await su.query("select 1 from public.product_images where product_id = $1", [productId])).rowCount;
  await su.query(
    `insert into public.product_images (product_id, cloudinary_public_id, url, position, is_cover)
     values ($1, $2, $3, $4, $5)`,
    [productId, `plants-and-pure/products/test-${n}`, `https://res.cloudinary.com/test/image/upload/plants-and-pure/products/test-${n}.jpg`,
     (await su.query("select count(*)::int as n from public.product_images where product_id = $1", [productId])).rows[0].n, isCover],
  );
}

export type Fixture = {
  categoryId: string;
  zoneId: string;
  freeZoneId: string;
  pickupZoneId: string;
  products: { id: string; price: string; stock: number; slug: string }[];
};

/** Catalogue fixtures — created by the trusted role, like an admin tool would. */
export async function seedCatalogue(su: pg.Client): Promise<Fixture> {
  const cat = await su.query("select id from public.categories where slug = 'culinary-spices'");
  const categoryId = cat.rows[0].id as string;
  const mk = async (slug: string, price: string, stock: number, active = true) => {
    const id = await insertProduct(su, { categoryId, title: `Test ${slug}`, slug, price, stock, sku: `SKU-${slug}`, published: active });
    return { id, price, stock, slug };
  };
  const products = [
    await mk("test-alpha", "10.00", 10),
    await mk("test-beta", "25.50", 5),
    await mk("test-last-unit", "40.00", 1),
    await mk("test-draft", "5.00", 10, false),
  ];
  const zone = async (slug: string, fee: string, freeOver: string | null, pickup = false) => {
    const r = await su.query(
      `insert into public.delivery_zones (slug, name, fee, free_over, is_pickup)
       values ($1, $2, $3, $4, $5) returning id`,
      [slug, `Zone ${slug}`, fee, freeOver, pickup],
    );
    return r.rows[0].id as string;
  };
  return {
    categoryId,
    zoneId: await zone("zone-a", "30.00", null),
    freeZoneId: await zone("zone-free", "30.00", "100.00"),
    pickupZoneId: await zone("pickup", "0.00", null, true),
    products,
  };
}

export const customerArgs = (over: Record<string, unknown> = {}) => ({
  clientRequestId: uuid(),
  userId: null as string | null,
  name: "Abena Mensah",
  phone: "0241234567",
  email: "abena@example.test",
  address: "House 4, Near the market, Accra",
  notes: null as string | null,
  ...over,
});

/** Call create_checkout_order as the server (service_role) and return the parsed JSON. */
export async function createOrder(
  c: pg.Client,
  zoneId: string,
  items: unknown,
  over: Record<string, unknown> = {},
) {
  const a = customerArgs(over);
  const r = await commitAs(c, { role: "service_role" }, () =>
    c.query("select public.create_checkout_order($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) as r", [
      a.clientRequestId, a.userId, a.name, a.phone, a.email, a.address, zoneId, a.notes, JSON.stringify(items),
    ]),
  );
  return r.rows[0].r as {
    order_id: string; public_id: string; order_number: number; subtotal: number; delivery_fee: number;
    total_amount: number; currency: string; amount_minor: string | number; payment_status: string; reused: boolean;
  };
}

export async function beginPayment(c: pg.Client, orderId: string, ref = `PP-TEST-${crypto.randomBytes(5).toString("hex")}`) {
  const r = await commitAs(c, { role: "service_role" }, () =>
    c.query("select public.begin_payment_attempt($1,$2) as r", [orderId, ref]),
  );
  return r.rows[0].r as { reference: string; status: string; amount_minor: string | number; reused: boolean; authorization_url: string | null };
}

export async function applyResult(
  c: pg.Client,
  ref: string,
  status: string,
  amountMinor: number | null,
  currency: string | null = "GHS",
) {
  const r = await commitAs(c, { role: "service_role" }, () =>
    c.query("select public.apply_payment_result($1,$2,$3,$4,$5,$6,$7,$8) as r", [
      ref, status, amountMinor, currency, "txn-" + ref, "card", status === "success" ? "Approved" : status, new Date().toISOString(),
    ]),
  );
  return r.rows[0].r as { outcome: string; transitioned: boolean; payment_status?: string; shortfalls?: unknown[]; order_id?: string };
}

export async function stockOf(su: pg.Client, productId: string) {
  const r = await su.query("select stock from public.products where id = $1", [productId]);
  return r.rows[0].stock as number;
}
