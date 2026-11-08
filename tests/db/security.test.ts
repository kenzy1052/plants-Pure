// Database security tests: RLS, privileges, constraints, profile provisioning.
// Needs a scratch PostgreSQL server:  TEST_DATABASE_URL=postgres://… npm run test:db
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import pg from "pg";
import {
  asRole, commitAs, createOrder, createUser, expectPgError, hasDb, makeRole, seedCatalogue,
  setupDb, uuid, type Fixture, type TestDb,
} from "./helpers";
import { listMigrations, runSqlFile } from "../../scripts/db/lib.mjs";

describe.skipIf(!hasDb)("database security (RLS, privileges, constraints)", () => {
  let db: TestDb;
  let fx: Fixture;
  let alice: string, bob: string, admin: string, dispatch: string;

  beforeAll(async () => {
    db = await setupDb();
    fx = await seedCatalogue(db.su);
    alice = await createUser(db.su, { email: "alice@example.test" });
    bob = await createUser(db.su, { email: "bob@example.test" });
    admin = await createUser(db.su, { email: "admin@example.test" });
    dispatch = await createUser(db.su, { email: "dispatch@example.test" });
    await makeRole(db.su, admin, "admin");
    await makeRole(db.su, dispatch, "dispatch");
  });
  afterAll(async () => {
    await db?.drop();
  });

  const as = {
    anon: { role: "anon" as const },
    alice: () => ({ role: "authenticated" as const, sub: alice }),
    bob: () => ({ role: "authenticated" as const, sub: bob }),
    admin: () => ({ role: "authenticated" as const, sub: admin }),
    dispatch: () => ({ role: "authenticated" as const, sub: dispatch }),
    service: { role: "service_role" as const },
  };

  describe("migrations", () => {
    it("are idempotent: re-running every migration on the migrated database succeeds", async () => {
      for (const f of listMigrations()) {
        const c = await db.newClient();
        await runSqlFile(c, f);
      }
    });

    it("preserve existing data from the baseline dump (3 seeded categories)", async () => {
      const r = await db.su.query("select slug from public.categories order by slug");
      expect(r.rows.map((x) => x.slug)).toEqual(["culinary-spices", "herbal-infusions", "pure-botanical-oils"]);
    });

    it("leave RLS enabled on every public table", async () => {
      const r = await db.su.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      );
      expect(r.rows).toEqual([]);
    });
  });

  describe("profile provisioning", () => {
    it("creates a profile with role=customer when a user registers", async () => {
      const id = await createUser(db.su);
      const r = await db.su.query("select role from public.profiles where id = $1", [id]);
      expect(r.rows).toEqual([{ role: "customer" }]);
    });

    it("ignores a role smuggled in through sign-up metadata", async () => {
      const id = await createUser(db.su, { meta: { role: "admin", first_name: "Eve", is_admin: true } });
      const r = await db.su.query("select role, first_name from public.profiles where id = $1", [id]);
      expect(r.rows[0]).toEqual({ role: "customer", first_name: "Eve" });
    });

    it("tolerates hostile metadata shapes without blocking registration", async () => {
      const id = await createUser(db.su, { meta: { first_name: { nested: true }, phone: "x".repeat(500) } });
      const r = await db.su.query("select 1 from public.profiles where id = $1", [id]);
      expect(r.rowCount).toBe(1);
    });

    it("never overwrites an existing profile (idempotent)", async () => {
      const id = await createUser(db.su, { meta: { first_name: "Original" } });
      await db.su.query("select public.provision_profile($1, $2::jsonb)", [id, JSON.stringify({ first_name: "Changed" })]);
      const r = await db.su.query("select first_name from public.profiles where id = $1", [id]);
      expect(r.rows[0].first_name).toBe("Original");
    });

    it("ensure_my_profile() heals a user whose profile is missing", async () => {
      const id = await createUser(db.su, { meta: { first_name: "Heal" } });
      await db.su.query("delete from public.profiles where id = $1", [id]);
      const c = await db.newClient();
      const r = await asRole(c, { role: "authenticated", sub: id }, () => c.query("select (public.ensure_my_profile()).* "));
      expect(r.rows[0]).toMatchObject({ id, first_name: "Heal", role: "customer" });
    });

    it("ensure_my_profile() is not callable by anonymous visitors", async () => {
      const c = await db.newClient();
      await expectPgError(asRole(c, as.anon, () => c.query("select public.ensure_my_profile()")), "42501");
    });
  });

  describe("profiles: isolation and privilege escalation", () => {
    it("a customer can read their own profile", async () => {
      const c = await db.newClient();
      const r = await asRole(c, as.alice(), () => c.query("select id from public.profiles"));
      expect(r.rows).toEqual([{ id: alice }]);
    });

    it("a customer cannot read another customer's profile", async () => {
      const c = await db.newClient();
      const r = await asRole(c, as.alice(), () => c.query("select id from public.profiles where id = $1", [bob]));
      expect(r.rowCount).toBe(0);
    });

    it("anonymous visitors cannot read profiles at all", async () => {
      const c = await db.newClient();
      await expectPgError(asRole(c, as.anon, () => c.query("select * from public.profiles")), "42501");
    });

    it("a customer can update their own contact fields", async () => {
      const c = await db.newClient();
      const r = await asRole(c, as.alice(), () =>
        c.query("update public.profiles set phone = '0240000000', delivery_area = 'Osu' where id = $1 returning phone", [alice]),
      );
      expect(r.rows[0].phone).toBe("0240000000");
    });

    it("a customer CANNOT grant themselves admin (column privilege)", async () => {
      const c = await db.newClient();
      await expectPgError(
        asRole(c, as.alice(), () => c.query("update public.profiles set role = 'admin' where id = $1", [alice])),
        "42501",
      );
    });

    it("a customer cannot change profile ids", async () => {
      const c = await db.newClient();
      await expectPgError(
        asRole(c, as.alice(), () => c.query("update public.profiles set id = $2 where id = $1", [alice, uuid()])),
        "42501",
      );
    });

    it("a customer cannot update someone else's profile (0 rows)", async () => {
      const c = await db.newClient();
      const r = await asRole(c, as.alice(), () =>
        c.query("update public.profiles set phone = '0999999999' where id = $1", [bob]),
      );
      expect(r.rowCount).toBe(0);
    });

    it("a customer cannot insert or delete profiles directly", async () => {
      const c = await db.newClient();
      await expectPgError(asRole(c, as.alice(), () => c.query("insert into public.profiles (id) values ($1)", [uuid()])), "42501");
      await expectPgError(asRole(c, as.alice(), () => c.query("delete from public.profiles where id = $1", [alice])), "42501");
    });

    it("the role-guard trigger blocks role changes even if privileges were widened by mistake", async () => {
      const c = await db.newClient();
      await c.query("begin");
      try {
        await c.query("grant update (role) on public.profiles to authenticated"); // simulate a bad grant
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: alice })]);
        await expectPgError(
          c.query("update public.profiles set role = 'admin' where id = $1", [alice]),
          "42501",
          "role is not permitted",
        );
      } finally {
        await c.query("rollback");
      }
    });

    it("trusted roles (service_role) can change roles; admins can read all profiles", async () => {
      const id = await createUser(db.su);
      const c = await db.newClient();
      await commitAs(c, as.service, () => c.query("update public.profiles set role = 'dispatch' where id = $1", [id]));
      const r = await db.su.query("select role from public.profiles where id = $1", [id]);
      expect(r.rows[0].role).toBe("dispatch");

      const c2 = await db.newClient();
      const all = await asRole(c2, as.admin(), () => c2.query("select count(*)::int as n from public.profiles"));
      expect(all.rows[0].n).toBeGreaterThanOrEqual(4);
    });
  });

  describe("catalogue: public read, admin-only write", () => {
    it("visitors see published products only (drafts and archived are hidden)", async () => {
      await db.su.query(
        `insert into public.products (title, slug, description, price, stock, is_active, archived_at)
         values ('Archived', 'archived-one', 'x', 1, 1, false, now())`,
      );
      const c = await db.newClient();
      const r = await asRole(c, as.anon, () => c.query("select slug from public.products order by slug"));
      const slugs = r.rows.map((x) => x.slug);
      expect(slugs).toContain("test-alpha");
      expect(slugs).not.toContain("test-draft");
      expect(slugs).not.toContain("archived-one");
    });

    it("admins see drafts too", async () => {
      const c = await db.newClient();
      const r = await asRole(c, as.admin(), () => c.query("select slug from public.products where slug = 'test-draft'"));
      expect(r.rowCount).toBe(1);
    });

    it("anonymous visitors cannot change products", async () => {
      const c = await db.newClient();
      await expectPgError(asRole(c, as.anon, () => c.query("update public.products set price = 0.01")), "42501");
      await expectPgError(
        asRole(c, as.anon, () => c.query("insert into public.products (title, slug, description, price) values ('x','x','x',1)")),
        "42501",
      );
    });

    it("a signed-in customer cannot change prices or stock (RLS filters the rows to none)", async () => {
      const c = await db.newClient();
      const r = await asRole(c, as.alice(), () => c.query("update public.products set price = 0.01, stock = 9999 returning id"));
      expect(r.rowCount).toBe(0);
      const check = await db.su.query("select price from public.products where slug = 'test-alpha'");
      expect(check.rows[0].price).toBe("10.00");
    });

    it("a customer cannot insert or delete products", async () => {
      const c = await db.newClient();
      await expectPgError(
        asRole(c, as.alice(), () => c.query("insert into public.products (title, slug, description, price) values ('x','x2','x',1)")),
        "42501",
      );
      const r = await asRole(c, as.alice(), () => c.query("delete from public.products returning id"));
      expect(r.rowCount).toBe(0);
    });

    it("admins can create and edit products and the change is audited with old and new values", async () => {
      const c = await db.newClient();
      await commitAs(c, as.admin(), async () => {
        await c.query("insert into public.products (title, slug, description, price, stock, is_active) values ('Admin made','admin-made','d', 12, 3, false)");
        await c.query("update public.products set price = 15 where slug = 'admin-made'");
      });
      const a = await db.su.query(
        `select actor_id, action, changes from public.audit_log
         where table_name = 'products' and changes -> 'price' is not null order by id desc limit 1`,
      );
      expect(a.rows[0].actor_id).toBe(admin);
      expect(a.rows[0].action).toBe("UPDATE");
      expect(a.rows[0].changes.price).toMatchObject({ old: 12, new: 15 });
    });

    it("rejects bad catalogue data (negative price/stock, bad slug, compare_at <= price)", async () => {
      const ins = (cols: string, vals: string) =>
        db.su.query(`insert into public.products (title, slug, description, price ${cols}) values ('t','s-${uuid().slice(0, 6)}','d', ${vals})`);
      await expectPgError(db.su.query("insert into public.products (title, slug, description, price) values ('t','neg','d',-1)"), "23514");
      await expectPgError(ins(", stock", "1, -5"), "23514");
      await expectPgError(db.su.query("insert into public.products (title, slug, description, price) values ('t','Bad Slug','d',1)"), "23514");
      await expectPgError(ins(", compare_at_price", "10, 10"), "23514");
      await expectPgError(ins(", weight_grams", "1, 0"), "23514");
    });

    it("new products default to draft with zero stock and no assumed weight", async () => {
      const r = await db.su.query(
        "insert into public.products (title, slug, description, price) values ('Defaults','defaults-check','d', 1) returning is_active, stock, weight_grams",
      );
      expect(r.rows[0]).toEqual({ is_active: false, stock: 0, weight_grams: null });
    });

    it("records every stock change in the inventory ledger", async () => {
      const c = await db.newClient();
      await commitAs(c, as.admin(), () => c.query("update public.products set stock = stock + 7 where slug = 'test-alpha'"));
      const r = await db.su.query(
        `select m.delta, m.reason from public.inventory_movements m join public.products p on p.id = m.product_id
         where p.slug = 'test-alpha' order by m.id desc limit 1`,
      );
      expect(r.rows[0]).toEqual({ delta: 7, reason: "adjustment" });
      await db.su.query("update public.products set stock = stock - 7 where slug = 'test-alpha'");
    });

    it("product images: public read follows product visibility; writes are admin-only", async () => {
      const p = fx.products[0].id;
      const draft = fx.products[3].id;
      await db.su.query(
        `insert into public.product_images (product_id, cloudinary_public_id, url, is_cover)
         values ($1, 'plants-and-pure/products/a', 'https://res.cloudinary.com/x/image/upload/plants-and-pure/products/a.jpg', false),
                ($2, 'plants-and-pure/products/d', 'https://res.cloudinary.com/x/image/upload/plants-and-pure/products/d.jpg', true)`,
        [p, draft],
      );
      const c = await db.newClient();
      const r = await asRole(c, as.anon, () => c.query("select cloudinary_public_id from public.product_images"));
      const ids = r.rows.map((x) => x.cloudinary_public_id);
      expect(ids).toContain("plants-and-pure/products/a");     // image of a published product
      expect(ids).not.toContain("plants-and-pure/products/d"); // image of a draft stays hidden
      await expectPgError(
        asRole(c, as.alice(), () =>
          c.query("insert into public.product_images (product_id, cloudinary_public_id, url) values ($1,'plants-and-pure/x','https://res.cloudinary.com/x')", [p]),
        ),
        "42501",
      );
      // only one cover per product, and public ids must live under our folder
      await expectPgError(
        db.su.query(
          "insert into public.product_images (product_id, cloudinary_public_id, url, is_cover) values ($1,'plants-and-pure/products/b','https://res.cloudinary.com/x/b', true)",
          [p],
        ),
        "23505",
      );
      await expectPgError(
        db.su.query("insert into public.product_images (product_id, cloudinary_public_id, url) values ($1,'someone-elses/folder/x','https://res.cloudinary.com/x/y')", [p]),
        "23514",
      );
    });
  });

  describe("orders: the open-insert hole is closed and customers are isolated", () => {
    it("anonymous visitors cannot insert orders (previously allowed by 'Anyone can create orders')", async () => {
      const c = await db.newClient();
      await expectPgError(
        asRole(c, as.anon, () =>
          c.query(
            `insert into public.orders (customer_name, customer_phone, delivery_address, delivery_area, subtotal, total_amount, payment_status)
             values ('Mallory','0240000000','somewhere','x', 1, 1, 'paid')`,
          ),
        ),
        "42501",
      );
    });

    it("signed-in customers cannot insert orders or order items either", async () => {
      const c = await db.newClient();
      await expectPgError(
        asRole(c, as.alice(), () =>
          c.query(
            `insert into public.orders (customer_name, customer_phone, delivery_address, delivery_area, subtotal, total_amount, payment_status, user_id)
             values ('Alice','0240000000','somewhere','x', 1, 1, 'paid', $1)`,
            [alice],
          ),
        ),
        "42501",
      );
      await expectPgError(
        asRole(c, as.alice(), () => c.query("insert into public.order_items (product_title, quantity, unit_price, total_price) values ('x',1,1,1)")),
        "42501",
      );
    });

    describe("with orders in the system", () => {
      let aliceOrder: { order_id: string; public_id: string };
      let bobOrder: { order_id: string };
      beforeAll(async () => {
        const c = await db.newClient();
        aliceOrder = await createOrder(c, fx.zoneId, [{ product_id: fx.products[0].id, quantity: 1 }], { userId: alice });
        bobOrder = await createOrder(c, fx.zoneId, [{ product_id: fx.products[1].id, quantity: 1 }], { userId: bob });
      });

      it("customers see only their own orders and items", async () => {
        const c = await db.newClient();
        const orders = await asRole(c, as.alice(), () => c.query("select id from public.orders"));
        expect(orders.rows.map((r) => r.id)).toEqual([aliceOrder.order_id]);
        const items = await asRole(c, as.alice(), () => c.query("select order_id from public.order_items"));
        expect(new Set(items.rows.map((r) => r.order_id))).toEqual(new Set([aliceOrder.order_id]));
        const other = await asRole(c, as.alice(), () => c.query("select 1 from public.orders where id = $1", [bobOrder.order_id]));
        expect(other.rowCount).toBe(0);
      });

      it("anonymous visitors see no orders", async () => {
        const c = await db.newClient();
        await expectPgError(asRole(c, as.anon, () => c.query("select * from public.orders")), "42501");
      });

      it("customers cannot edit orders: not totals, not payment status, not fulfilment", async () => {
        const c = await db.newClient();
        await expectPgError(
          asRole(c, as.alice(), () => c.query("update public.orders set payment_status = 'paid' where id = $1", [aliceOrder.order_id])),
          "42501",
        );
        await expectPgError(
          asRole(c, as.alice(), () => c.query("update public.orders set total_amount = 0.01 where id = $1", [aliceOrder.order_id])),
          "42501",
        );
        const r = await asRole(c, as.alice(), () =>
          c.query("update public.orders set fulfillment_status = 'delivered' where id = $1", [aliceOrder.order_id]),
        );
        expect(r.rowCount).toBe(0); // RLS: customers have no UPDATE policy
        await expectPgError(
          asRole(c, as.alice(), () => c.query("delete from public.orders where id = $1", [aliceOrder.order_id])),
          "42501",
        );
      });

      it("staff can read every order but may change ONLY fulfilment status", async () => {
        const c = await db.newClient();
        const all = await asRole(c, as.dispatch(), () => c.query("select id from public.orders"));
        expect(all.rowCount).toBeGreaterThanOrEqual(2);
        await expectPgError(
          asRole(c, as.dispatch(), () => c.query("update public.orders set payment_status = 'paid' where id = $1", [aliceOrder.order_id])),
          "42501",
        );
        await expectPgError(
          asRole(c, as.dispatch(), () => c.query("update public.orders set total_amount = 1 where id = $1", [aliceOrder.order_id])),
          "42501",
        );
      });

      it("nothing can be shipped before it is paid (CHECK constraint, even for staff)", async () => {
        const c = await db.newClient();
        await expectPgError(
          asRole(c, as.dispatch(), () => c.query("update public.orders set fulfillment_status = 'dispatched' where id = $1", [aliceOrder.order_id])),
          "23514",
          "orders_fulfilment_requires_payment",
        );
      });

      it("money columns are consistent: total must equal subtotal + delivery fee", async () => {
        await expectPgError(
          db.su.query("update public.orders set total_amount = total_amount + 1 where id = $1", [aliceOrder.order_id]),
          "23514",
          "orders_total_consistent",
        );
      });

      it("payments, payment events, e-mail log, audit log and inventory ledger are admin-only", async () => {
        const c = await db.newClient();
        for (const t of ["payments", "payment_events", "email_log", "audit_log", "inventory_movements"]) {
          const asCustomer = await asRole(c, as.alice(), () => c.query(`select 1 from public.${t}`));
          expect(asCustomer.rowCount, `${t} visible to a customer`).toBe(0);
          await expectPgError(asRole(c, as.anon, () => c.query(`select 1 from public.${t}`)), "42501");
        }
        const a = await asRole(c, as.admin(), () => c.query("select 1 from public.audit_log limit 1"));
        expect(a.rowCount).toBe(1);
      });

      it("order history is a snapshot: later product edits do not rewrite it", async () => {
        await db.su.query("update public.products set title = 'Renamed later', price = 99 where id = $1", [fx.products[0].id]);
        const r = await db.su.query("select product_title, unit_price, total_price from public.order_items where order_id = $1", [aliceOrder.order_id]);
        expect(r.rows[0]).toEqual({ product_title: "Test test-alpha", unit_price: "10.00", total_price: "10.00" });
        await db.su.query("update public.products set title = 'Test test-alpha', price = 10 where id = $1", [fx.products[0].id]);
      });
    });
  });

  describe("privileged functions are not callable through the public API", () => {
    const calls: [string, string, unknown[]][] = [
      ["create_checkout_order", "select public.create_checkout_order(null,null,'a','b','c','d',null,null,'[]'::jsonb)", []],
      ["begin_payment_attempt", "select public.begin_payment_attempt($1, 'PP-XXXXXXXX')", [uuid()]],
      ["apply_payment_result", "select public.apply_payment_result('x','success',1,'GHS',null,null,null,null)", []],
      ["record_payment_event", "select public.record_payment_event('k','charge.success','r','{}'::jsonb)", []],
      ["complete_payment_event", "select public.complete_payment_event(1,'processed')", []],
      ["cancel_unpaid_order", "select public.cancel_unpaid_order($1)", [uuid()]],
      ["expire_stale_pending_orders", "select public.expire_stale_pending_orders()", []],
      ["claim_email", "select public.claim_email('order_confirmation', $1, 'a@b.co')", [uuid()]],
      ["provision_profile", "select public.provision_profile($1, '{}'::jsonb)", [uuid()]],
    ];
    for (const [name, sql, params] of calls) {
      it(`${name}: denied to anon and authenticated, allowed to service_role`, async () => {
        const c = await db.newClient();
        await expectPgError(asRole(c, as.anon, () => c.query(sql, params)), "42501");
        await expectPgError(asRole(c, as.alice(), () => c.query(sql, params)), "42501");
        if (name === "provision_profile" || name === "begin_payment_attempt") return; // service_role path covered elsewhere
        await asRole(c, as.service, () => c.query(sql, params)).catch((e) => {
          // the call may fail for business reasons, but never because of permissions
          expect((e as { code?: string }).code).not.toBe("42501");
        });
      });
    }

    it("every SECURITY DEFINER function in public pins an empty search_path", async () => {
      const r = await db.su.query(`
        select p.proname, p.proconfig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef and p.proname <> 'rls_auto_enable'`);
      expect(r.rows.length).toBeGreaterThan(10);
      for (const row of r.rows) {
        expect(row.proconfig, `${row.proname} search_path`).toContain('search_path=""');
      }
    });

    it("the API roles hold no write privileges on server-owned tables", async () => {
      const r = await db.su.query(`
        select grantee, table_name, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and grantee in ('anon','authenticated')
          and table_name in ('payments','payment_events','email_log','audit_log','inventory_movements','orders','order_items')
          and privilege_type in ('INSERT','DELETE','TRUNCATE')`);
      expect(r.rows).toEqual([]);
    });

    it("service_role cannot rewrite or delete the audit log (append-only for the app)", async () => {
      const c = await db.newClient();
      await expectPgError(asRole(c, as.service, () => c.query("update public.audit_log set action = 'INSERT'")), "42501");
      await expectPgError(asRole(c, as.service, () => c.query("delete from public.audit_log")), "42501");
    });
  });

  describe("audit trail", () => {
    it("records role changes without copying personal data", async () => {
      const id = await createUser(db.su);
      await db.su.query("update public.profiles set role = 'dispatch', phone = '0241111111' where id = $1", [id]);
      const r = await db.su.query(
        "select changes from public.audit_log where table_name = 'profiles' and record_id = $1 order by id desc limit 1",
        [id],
      );
      expect(r.rows[0].changes).toEqual({ role: { old: "customer", new: "dispatch" } });
    });
  });

  it("migration files contain no secrets or real credentials", () => {
    for (const f of listMigrations() as string[]) {
      const text = fs.readFileSync(f, "utf8");
      expect(text).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{10,}/);
      expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
      expect(text).not.toMatch(/re_[A-Za-z0-9]{20,}/);
    }
  });
});

void pg;
