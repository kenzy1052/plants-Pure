// Phase 4 — catalogue management, run against REAL PostgreSQL (scratch database built from
// the baseline dump + all migrations). Needs:  TEST_DATABASE_URL=postgres://… npm run test:db
//
// Covers the product lifecycle, publication rules, categories, images, stock operations,
// authorisation (anon / customer / admin), column-level privacy, auditing and concurrency.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { root } from "../../scripts/db/lib.mjs";
import {
  addTestImage, asRole, commitAs, createOrder, createUser, expectPgError, hasDb, insertProduct, makeRole,
  seedCatalogue, setupDb, uuid, type Fixture, type TestDb, type Who,
} from "./helpers";

type Json = Record<string, any>;

describe.skipIf(!hasDb)("catalogue management (PostgreSQL)", () => {
  let db: TestDb;
  let fx: Fixture;
  let c: pg.Client;
  let admin: string, alice: string;
  const who = {
    anon: { role: "anon" } as Who,
    admin: () => ({ role: "authenticated", sub: admin }) as Who,
    alice: () => ({ role: "authenticated", sub: alice }) as Who,
  };

  beforeAll(async () => {
    db = await setupDb();
    fx = await seedCatalogue(db.su);
    admin = await createUser(db.su, { email: "admin@example.test" });
    alice = await createUser(db.su, { email: "alice@example.test" });
    await makeRole(db.su, admin, "admin");
    c = await db.newClient();
  });
  afterAll(async () => {
    await db?.drop();
  });

  // ---- helpers -------------------------------------------------------------------------
  const rpc = async <T = Json>(w: Who, sql: string, params: unknown[] = []): Promise<T> =>
    commitAs(c, w, async () => (await c.query(`select ${sql} as r`, params)).rows[0].r as T);
  const save = (id: string | null, version: number | null, data: Json, w: Who = who.admin()) =>
    rpc(w, "public.admin_save_product($1, $2, $3::jsonb)", [id, version, JSON.stringify(data)]);
  const setStatus = (id: string, status: string, version: number | null = null, w: Who = who.admin()) =>
    rpc(w, "public.admin_set_product_status($1, $2, $3)", [id, status, version]);
  const adjust = (id: string, delta: number, reason = "restock", note: string | null = null, w: Who = who.admin(), client = c) =>
    commitAs(client, w, async () => (await client.query("select public.admin_adjust_stock($1,$2,$3,$4) as r", [id, delta, reason, note])).rows[0].r as Json);
  const addImage = (productId: string, n: string, w: Who = who.admin()) =>
    rpc<Json[]>(w, "public.admin_add_product_image($1,$2,$3,$4,$5,$6,$7,$8)", [
      productId, `plants-and-pure/products/${n}`, `https://res.cloudinary.com/test/image/upload/plants-and-pure/products/${n}.jpg`,
      null, 800, 800, 12345, "jpg",
    ]);
  const slug = () => `p-${uuid().slice(0, 8)}`;

  /** Expect a business-rule error: SQLSTATE P0001, message = CODE, detail contains `detail`. */
  async function expectBiz(p: Promise<unknown>, code: string, detail?: string) {
    const err = (await expectPgError(p, "P0001", code)) as { message: string; detail?: string };
    expect(err.message).toBe(code);
    if (detail) expect(err.detail ?? "").toContain(detail);
  }

  /** A complete, publishable product (draft) created through the admin function. */
  async function readyProduct(extra: Json = {}) {
    const p = (await save(null, null, {
      title: "Ready product", slug: slug(), description: "A full description of the product.", price: 25,
      category_id: fx.categoryId, stock: 5, ...extra,
    })) as Json;
    await addImage(p.id, `img-${uuid().slice(0, 6)}`);
    return p;
  }

  // ===== product lifecycle ================================================================
  describe("product lifecycle", () => {
    it("creates a valid draft with only a title and slug; defaults are safe and the actor is stamped", async () => {
      const s = slug();
      const p = await save(null, null, { title: "Cumin", slug: s });
      expect(p).toMatchObject({ title: "Cumin", slug: s, status: "draft", is_active: false, stock: 0, currency: "GHS", version: 1, created_by: admin, updated_by: admin });
      expect(p.search_tsv).toBeUndefined(); // internal column is not returned
    });

    it("a draft is invisible to visitors and customers, even by direct slug lookup", async () => {
      const s = slug();
      await save(null, null, { title: "Hidden draft", slug: s });
      for (const w of [who.anon, who.alice()]) {
        const r = await asRole(c, w, () => c.query("select slug from public.products where slug = $1", [s]));
        expect(r.rowCount).toBe(0);
      }
    });

    it("rejects invalid input: unknown fields, wrong types, bad numbers, bad slug", async () => {
      await expectBiz(save(null, null, { title: "x", slug: slug(), is_admin: true }), "INVALID_INPUT", "unknown field");
      await expectBiz(save(null, null, { title: "x", slug: slug(), price: "cheap" }), "INVALID_INPUT", "wrong type");
      await expectBiz(save(null, null, { title: "x", slug: slug(), flavor_notes: Array.from({ length: 13 }, (_, i) => `n${i}`) }), "INVALID_INPUT");
      await expectPgError(save(null, null, { title: "x", slug: slug(), price: -1 }), "23514");
      await expectPgError(save(null, null, { title: "x", slug: slug(), price: 2_000_000 }), "23514");
      await expectPgError(save(null, null, { title: "x", slug: "Bad Slug" }), "23514");
      await expectPgError(save(null, null, { title: "   ", slug: slug() }), "23514");
      await expectPgError(save(null, null, { title: "x", slug: slug(), price: 10, compare_at_price: 10 }), "23514");
      await expectPgError(save(null, null, { title: "x", slug: slug(), weight_grams: 0 }), "23514");
      await expectPgError(save(null, null, { title: "x", slug: slug(), stock: -3 }), "23514");
      await expectPgError(save(null, null, { title: "x", slug: slug(), low_stock_threshold: -1 }), "23514");
      await expectPgError(save(null, null, { title: "x", slug: slug(), category_id: uuid() }), "23503");
      await expectPgError(save(null, null, { slug: slug() }), "23502"); // title is required
    });

    it("slugs are unique and SKUs are unique case-insensitively", async () => {
      const s = slug();
      await save(null, null, { title: "A", slug: s });
      await expectPgError(save(null, null, { title: "B", slug: s }), "23505", "products_slug_key");
      const sku = `SKU-${uuid().slice(0, 6)}`;
      await save(null, null, { title: "C", slug: slug(), sku });
      await expectPgError(save(null, null, { title: "D", slug: slug(), sku: sku.toLowerCase() }), "23505", "products_sku_ci_key");
    });

    it("edits content, bumps the version, and refuses a stale edit", async () => {
      const p = await save(null, null, { title: "Original", slug: slug() });
      const e1 = await save(p.id, p.version, { title: "Edited", price: 12.5, flavor_notes: ["warm", "earthy", " "] });
      expect(e1).toMatchObject({ title: "Edited", version: 2, flavor_notes: ["warm", "earthy"] });
      expect(Number(e1.price)).toBe(12.5);
      await expectBiz(save(p.id, p.version, { title: "Someone else's older copy" }), "STALE_PRODUCT");
      await expectBiz(save(uuid(), null, { title: "x" }), "NOT_FOUND");
    });

    it("stock cannot be edited through the content form after creation (only through stock operations)", async () => {
      const p = await save(null, null, { title: "S", slug: slug(), stock: 4 });
      await expectBiz(save(p.id, null, { stock: 99 }), "INVALID_INPUT", "stock adjustment");
      expect((await db.su.query("select stock from public.products where id=$1", [p.id])).rows[0].stock).toBe(4);
    });

    it("refuses to publish an incomplete product and says exactly what is missing", async () => {
      const p = await save(null, null, { title: "Bare", slug: slug() });
      const err = (await expectPgError(setStatus(p.id, "published"), "P0001", "PUBLICATION_REQUIREMENTS")) as { detail: string };
      for (const code of ["description_missing", "price_invalid", "category_missing", "image_missing"]) expect(err.detail).toContain(code);
      expect((await db.su.query("select status from public.products where id=$1", [p.id])).rows[0].status).toBe("draft");
    });

    it("the publication rule holds for EVERY writer, not just the admin function", async () => {
      const p = await save(null, null, { title: "Bare 2", slug: slug() });
      await expectBiz(db.su.query("update public.products set is_active = true where id = $1", [p.id]), "PUBLICATION_REQUIREMENTS"); // SQL editor / service role
      await expectBiz(commitAs(c, who.admin(), () => c.query("update public.products set is_active = true where id = $1", [p.id])), "PUBLICATION_REQUIREMENTS"); // admin via the REST API
      await expectBiz(db.su.query("insert into public.products (title, slug, description, price, is_active) values ('x', $1, 'long enough text', 5, true)", [slug()]), "PUBLICATION_REQUIREMENTS");
    });

    it("publishes a complete product; visitors then see it, and editing the slug of a live product is refused", async () => {
      const p = await readyProduct();
      const live = await setStatus(p.id, "published", p.version);
      expect(live).toMatchObject({ status: "published", is_active: true });
      const r = await asRole(c, who.anon, () => c.query("select slug, price from public.products where id = $1", [p.id]));
      expect(r.rowCount).toBe(1);
      await expectBiz(save(p.id, null, { slug: slug() }), "SLUG_LOCKED");
      const ok = await save(p.id, null, { tagline: "Still editable" });
      expect(ok.tagline).toBe("Still editable");
    });

    it("blocks changes that would make a live product invalid (price 0, blank description, no category)", async () => {
      const p = await readyProduct();
      await setStatus(p.id, "published");
      await expectBiz(save(p.id, null, { price: 0 }), "PUBLICATION_REQUIREMENTS", "price_invalid");
      await expectBiz(save(p.id, null, { description: "short" }), "PUBLICATION_REQUIREMENTS", "description_missing");
      await expectBiz(save(p.id, null, { category_id: null }), "PUBLICATION_REQUIREMENTS", "category_missing");
    });

    it("unpublish returns to draft; archive hides from the public but keeps the record; restore comes back as a draft", async () => {
      const p = await readyProduct();
      await setStatus(p.id, "published");
      expect((await setStatus(p.id, "draft")).status).toBe("draft");
      await setStatus(p.id, "published");
      const arch = await setStatus(p.id, "archived");
      expect(arch).toMatchObject({ status: "archived", is_active: false });
      expect(arch.archived_at).toBeTruthy();
      for (const w of [who.anon, who.alice()]) {
        expect((await asRole(c, w, () => c.query("select 1 from public.products where id = $1", [p.id]))).rowCount).toBe(0);
      }
      await expectBiz(save(p.id, null, { title: "no edits while archived" }), "PRODUCT_ARCHIVED");
      await expectBiz(setStatus(p.id, "published"), "PRODUCT_ARCHIVED");
      expect(await setStatus(p.id, "draft")).toMatchObject({ status: "draft", archived_at: null });
      await expectBiz(setStatus(p.id, "nonsense"), "INVALID_INPUT");
    });

    it("an archived product can never also be 'active' (single, unambiguous state)", async () => {
      const p = await readyProduct();
      await expectPgError(db.su.query("update public.products set is_active = true, archived_at = now() where id = $1", [p.id]), "23514", "products_archived_not_active");
    });

    it("archiving keeps order history valid; products with orders or a live listing can never be deleted", async () => {
      const ordered = fx.products[0];
      await db.su.query("update public.products set is_active = false, archived_at = now() where id = $1", [ordered.id]).catch(() => undefined);
      // the fixture product has no orders yet: create one, then try to delete
      await db.su.query("update public.products set archived_at = null, is_active = true where id = $1", [ordered.id]);
      const svc = await db.newClient();
      await commitAs(svc, { role: "service_role" }, () => createOrder(svc, fx.zoneId, [{ product_id: ordered.id, quantity: 1 }]));
      await setStatus(ordered.id, "archived");
      await expectBiz(rpc(who.admin(), "public.admin_delete_product($1)", [ordered.id]), "PRODUCT_HAS_ORDERS");
      await expectBiz(db.su.query("delete from public.products where id = $1", [ordered.id]), "PRODUCT_HAS_ORDERS");
      const items = await db.su.query("select product_id from public.order_items where product_id = $1", [ordered.id]);
      expect(items.rowCount).toBeGreaterThan(0);
      await setStatus(ordered.id, "draft");
      await setStatus(ordered.id, "published"); // restore for the other tests
    });

    it("never-published, never-ordered drafts can be deleted; live products cannot", async () => {
      const d = await save(null, null, { title: "Typo", slug: slug() });
      await rpc(who.admin(), "public.admin_delete_product($1)", [d.id]);
      expect((await db.su.query("select 1 from public.products where id=$1", [d.id])).rowCount).toBe(0);
      const live = await readyProduct();
      await setStatus(live.id, "published");
      await expectBiz(rpc(who.admin(), "public.admin_delete_product($1)", [live.id]), "PRODUCT_PUBLISHED");
    });

    it("created_by cannot be spoofed and updated_by always names the caller", async () => {
      const s = slug();
      await commitAs(c, who.admin(), () =>
        c.query("insert into public.products (title, slug, description, price, created_by, updated_by) values ('Spoof', $1, 'long enough text', 5, $2, $2)", [s, alice]));
      const r = await db.su.query("select created_by, updated_by from public.products where slug = $1", [s]);
      expect(r.rows[0]).toEqual({ created_by: admin, updated_by: admin });
    });
  });

  // ===== categories ==============================================================================
  describe("categories", () => {
    const saveCat = (id: string | null, data: Json, w: Who = who.admin()) =>
      rpc(w, "public.admin_save_category($1, $2::jsonb)", [id, JSON.stringify(data)]);

    it("creates and edits a category through the admin function", async () => {
      const s = `cat-${uuid().slice(0, 6)}`;
      const created = await saveCat(null, { name: "Teas & Tisanes", slug: s, description: "  Loose leaf  ", display_order: 7 });
      expect(created).toMatchObject({ name: "Teas & Tisanes", slug: s, description: "Loose leaf", display_order: 7, is_active: true });
      const edited = await saveCat(created.id, { name: "Teas" });
      expect(edited).toMatchObject({ name: "Teas", slug: s });
    });

    it("rejects duplicate slugs, duplicate names (any case / spacing) and invalid slugs", async () => {
      const s = `cat-${uuid().slice(0, 6)}`;
      await saveCat(null, { name: `Dupe ${s}`, slug: s });
      await expectPgError(saveCat(null, { name: `Other ${s}`, slug: s }), "23505", "categories_slug_key");
      await expectPgError(saveCat(null, { name: `  dUPE ${s.toUpperCase()}  `, slug: `${s}-2` }), "23505", "categories_name_ci_key");
      await expectPgError(saveCat(null, { name: "Bad", slug: "Not A Slug" }), "23514");
      await expectBiz(saveCat(null, { name: "x", slug: "x1", colour: "red" }), "INVALID_INPUT");
    });

    it("products can only reference categories that exist", async () => {
      await expectPgError(save(null, null, { title: "Orphan", slug: slug(), category_id: uuid() }), "23503");
    });

    it("an inactive category disappears from the public API but stays visible to admins", async () => {
      const cat = await saveCat(null, { name: `Hidden ${uuid().slice(0, 4)}`, slug: `hid-${uuid().slice(0, 6)}`, is_active: false });
      const pub = await asRole(c, who.anon, () => c.query("select id from public.categories where id = $1", [cat.id]));
      expect(pub.rowCount).toBe(0);
      const list = await rpc<Json[]>(who.admin(), "public.admin_list_categories()");
      expect(list.find((x) => x.id === cat.id)).toMatchObject({ is_active: false, product_count: 0, published_count: 0 });
      expect((await asRole(c, who.anon, () => c.query("select id from public.categories"))).rows.length).toBeGreaterThanOrEqual(3);
    });

    it("a category with live products cannot be deactivated; one with any products cannot be deleted; an unused one can", async () => {
      const cat = await saveCat(null, { name: `Used ${uuid().slice(0, 4)}`, slug: `used-${uuid().slice(0, 6)}` });
      const p = await readyProduct({ category_id: cat.id });
      await setStatus(p.id, "published");
      await expectBiz(saveCat(cat.id, { is_active: false }), "CATEGORY_IN_USE");
      await expectBiz(rpc(who.admin(), "public.admin_delete_category($1)", [cat.id]), "CATEGORY_IN_USE");
      await expectPgError(db.su.query("delete from public.categories where id = $1", [cat.id]), "23503"); // FK is RESTRICT now
      const row = await db.su.query("select category_id from public.products where id = $1", [p.id]);
      expect(row.rows[0].category_id).toBe(cat.id); // not orphaned

      await setStatus(p.id, "archived"); // still references it
      await expectBiz(rpc(who.admin(), "public.admin_delete_category($1)", [cat.id]), "CATEGORY_IN_USE");
      expect((await saveCat(cat.id, { is_active: false })).is_active).toBe(false); // allowed: nothing live is in it

      const unused = await saveCat(null, { name: `Unused ${uuid().slice(0, 4)}`, slug: `unused-${uuid().slice(0, 6)}` });
      await rpc(who.admin(), "public.admin_delete_category($1)", [unused.id]);
      expect((await db.su.query("select 1 from public.categories where id=$1", [unused.id])).rowCount).toBe(0);
    });

    it("a product cannot be published into an inactive category", async () => {
      const cat = await saveCat(null, { name: `Off ${uuid().slice(0, 4)}`, slug: `off-${uuid().slice(0, 6)}`, is_active: false });
      const p = await readyProduct({ category_id: cat.id });
      await expectBiz(setStatus(p.id, "published"), "PUBLICATION_REQUIREMENTS", "category_inactive");
    });

    it("renaming a category does not disturb product relationships", async () => {
      const cat = await saveCat(null, { name: `Before ${uuid().slice(0, 4)}`, slug: `ren-${uuid().slice(0, 6)}` });
      const p = await readyProduct({ category_id: cat.id });
      await saveCat(cat.id, { name: `After ${uuid().slice(0, 4)}`, slug: `ren2-${uuid().slice(0, 6)}` });
      expect((await db.su.query("select category_id from public.products where id=$1", [p.id])).rows[0].category_id).toBe(cat.id);
    });
  });

  // ===== images ===================================================================================
  describe("product images", () => {
    it("the first image becomes the cover, later ones follow in order, never a second cover", async () => {
      const p = await save(null, null, { title: "Img", slug: slug() });
      const one = await addImage(p.id, "a1");
      expect(one).toMatchObject([{ position: 0, is_cover: true }]);
      const two = await addImage(p.id, "a2");
      const three = await addImage(p.id, "a3");
      expect(three.map((i) => [i.position, i.is_cover])).toEqual([[0, true], [1, false], [2, false]]);
      expect(two).toHaveLength(2);
    });

    it("rejects non-Cloudinary URLs, foreign folders and duplicates", async () => {
      const p = await save(null, null, { title: "Img2", slug: slug() });
      await expectPgError(rpc(who.admin(), "public.admin_add_product_image($1,$2,$3,null,1,1,1,'jpg')",
        [p.id, "plants-and-pure/products/x", "https://evil.example/x.jpg"]), "23514");
      await expectPgError(rpc(who.admin(), "public.admin_add_product_image($1,$2,$3,null,1,1,1,'jpg')",
        [p.id, "someone-else/x", "https://res.cloudinary.com/test/x.jpg"]), "23514");
      await addImage(p.id, "dup");
      await expectPgError(addImage(p.id, "dup"), "23505");
      await expectBiz(addImage(uuid(), "nope"), "NOT_FOUND");
    });

    it("reorders (the list must name every image once) and switches the cover atomically", async () => {
      const p = await save(null, null, { title: "Img3", slug: slug() });
      await addImage(p.id, "r1"); await addImage(p.id, "r2"); const all = await addImage(p.id, "r3");
      const [a, b, d] = all.map((i) => i.id);
      const re = await rpc<Json[]>(who.admin(), "public.admin_reorder_product_images($1, $2::uuid[])", [p.id, [d, a, b]]);
      expect(re.map((i) => i.id)).toEqual([d, a, b]);
      await expectBiz(rpc(who.admin(), "public.admin_reorder_product_images($1, $2::uuid[])", [p.id, [a, b]]), "INVALID_INPUT");
      await expectBiz(rpc(who.admin(), "public.admin_reorder_product_images($1, $2::uuid[])", [p.id, [a, a, b]]), "INVALID_INPUT");

      const cov = await rpc<Json[]>(who.admin(), "public.admin_set_cover_image($1,$2)", [p.id, b]);
      expect(cov.filter((i) => i.is_cover).map((i) => i.id)).toEqual([b]);
      await expectBiz(rpc(who.admin(), "public.admin_set_cover_image($1,$2)", [p.id, uuid()]), "NOT_FOUND");
      const other = await save(null, null, { title: "Other", slug: slug() });
      const foreign = (await addImage(other.id, "f1"))[0].id;
      await expectBiz(rpc(who.admin(), "public.admin_set_cover_image($1,$2)", [p.id, foreign]), "NOT_FOUND"); // another product's image
    });

    it("the single-cover rule is also enforced by the database itself", async () => {
      const p = await save(null, null, { title: "Img4", slug: slug() });
      await addImage(p.id, "s1");
      await expectPgError(addTestImage(db.su, p.id, true), "23505");
    });

    it("updates alt text; removing a cover promotes the next image and keeps positions dense", async () => {
      const p = await save(null, null, { title: "Img5", slug: slug() });
      await addImage(p.id, "m1"); await addImage(p.id, "m2"); const all = await addImage(p.id, "m3");
      const alt = await rpc<Json[]>(who.admin(), "public.admin_update_image_alt($1,$2)", [all[1].id, "  A bowl of cumin  "]);
      expect(alt[1].alt_text).toBe("A bowl of cumin");
      await expectBiz(rpc(who.admin(), "public.admin_update_image_alt($1,$2)", [all[1].id, "x".repeat(201)]), "INVALID_INPUT");

      const removed = await rpc<Json>(who.admin(), "public.admin_remove_product_image($1)", [all[0].id]);
      expect(removed).toMatchObject({ public_id: "plants-and-pure/products/m1", still_referenced: false });
      expect(removed.images.map((i: Json) => [i.position, i.is_cover])).toEqual([[0, true], [1, false]]);
    });

    it("tells the caller when an asset is still used elsewhere, so it is not deleted from Cloudinary", async () => {
      const a = await save(null, null, { title: "A", slug: slug() });
      const b = await save(null, null, { title: "B", slug: slug() });
      const [ia] = await addImage(a.id, "shared");
      await addImage(b.id, "shared");
      const r = await rpc<Json>(who.admin(), "public.admin_remove_product_image($1)", [ia.id]);
      expect(r.still_referenced).toBe(true);
    });

    it("a published product cannot lose its last image or its cover — via the function or via direct SQL", async () => {
      const p = await readyProduct();
      await setStatus(p.id, "published");
      const imgs = (await db.su.query("select id from public.product_images where product_id=$1", [p.id])).rows;
      await expectBiz(rpc(who.admin(), "public.admin_remove_product_image($1)", [imgs[0].id]), "PUBLICATION_REQUIREMENTS", "image_missing");
      expect((await db.su.query("select 1 from public.product_images where product_id=$1", [p.id])).rowCount).toBe(1);
      await expectBiz(db.su.query("delete from public.product_images where product_id = $1", [p.id]), "PUBLICATION_REQUIREMENTS");
      await expectBiz(db.su.query("update public.product_images set is_cover = false where product_id = $1", [p.id]), "PUBLICATION_REQUIREMENTS", "cover_missing");
      // a draft may be emptied freely
      await setStatus(p.id, "draft");
      await rpc(who.admin(), "public.admin_remove_product_image($1)", [imgs[0].id]);
    });

    it("deleting a product removes its image rows (no orphans, no integrity error)", async () => {
      const d = await save(null, null, { title: "Gone", slug: slug() });
      await addImage(d.id, "gone1");
      await rpc(who.admin(), "public.admin_delete_product($1)", [d.id]);
      expect((await db.su.query("select 1 from public.product_images where product_id=$1", [d.id])).rowCount).toBe(0);
    });
  });

  // ===== inventory ================================================================================
  describe("inventory", () => {
    it("adjusts stock, writes a ledger row with actor, reason and note", async () => {
      const p = await save(null, null, { title: "Stock", slug: slug(), stock: 10 });
      const r = await adjust(p.id, 5, "restock", "Supplier delivery");
      expect(r).toMatchObject({ stock: 15, delta: 5 });
      await adjust(p.id, -3, "adjustment", "Damaged");
      const led = await db.su.query("select delta, stock_after, reason, note, actor_id from public.inventory_movements where product_id=$1 order by id", [p.id]);
      expect(led.rows).toEqual([
        { delta: 10, stock_after: 10, reason: "initial", note: null, actor_id: admin },
        { delta: 5, stock_after: 15, reason: "restock", note: "Supplier delivery", actor_id: admin },
        { delta: -3, stock_after: 12, reason: "adjustment", note: "Damaged", actor_id: admin },
      ]);
    });

    it("rejects invalid quantities and anything that would make stock negative", async () => {
      const p = await save(null, null, { title: "Stock2", slug: slug(), stock: 2 });
      await expectBiz(adjust(p.id, 0), "INVALID_STOCK");
      await expectBiz(adjust(p.id, -3), "INVALID_STOCK", "cannot remove");
      await expectBiz(adjust(p.id, 100001), "INVALID_STOCK");
      await expectBiz(adjust(p.id, 1, "theft"), "INVALID_INPUT");
      await expectBiz(adjust(p.id, 1, "sale"), "INVALID_INPUT"); // 'sale' is reserved for verified payments
      await expectBiz(adjust(uuid(), 1), "NOT_FOUND");
      await expectBiz(rpc(who.admin(), "public.admin_set_stock($1,$2,null)", [p.id, -1]), "INVALID_STOCK");
      await expectBiz(rpc(who.admin(), "public.admin_set_stock($1,$2,null)", [p.id, 1000001]), "INVALID_STOCK");
      expect((await db.su.query("select stock from public.products where id=$1", [p.id])).rows[0].stock).toBe(2);
      await expectPgError(db.su.query("update public.products set stock = -1 where id=$1", [p.id]), "23514");
    });

    it("a stocktake records the difference as a correction (and a no-op writes nothing)", async () => {
      const p = await save(null, null, { title: "Stock3", slug: slug(), stock: 8 });
      expect(await rpc(who.admin(), "public.admin_set_stock($1,$2,$3)", [p.id, 6, "Counted shelf"])).toMatchObject({ stock: 6, delta: -2 });
      expect(await rpc(who.admin(), "public.admin_set_stock($1,$2,null)", [p.id, 6])).toMatchObject({ stock: 6, delta: 0 });
      const led = await db.su.query("select delta, reason, note from public.inventory_movements where product_id=$1 order by id desc limit 2", [p.id]);
      expect(led.rows[0]).toEqual({ delta: -2, reason: "correction", note: "Counted shelf" });
      expect(led.rows[1].reason).toBe("initial"); // the no-op added nothing
    });

    it("stock changes do not change the content version (a sale never makes an admin's edit stale)", async () => {
      const p = await save(null, null, { title: "Stock4", slug: slug(), stock: 3 });
      await adjust(p.id, 4);
      await db.su.query("update public.products set stock = stock - 1 where id=$1", [p.id]);
      const v = (await db.su.query("select version from public.products where id=$1", [p.id])).rows[0].version;
      expect(v).toBe(p.version);
      expect((await save(p.id, p.version, { tagline: "ok" })).version).toBe(p.version + 1);
    });

    it("concurrent adjustments are all applied exactly once (row lock, no lost updates)", async () => {
      const p = await save(null, null, { title: "Race", slug: slug(), stock: 0 });
      const clients = await Promise.all(Array.from({ length: 10 }, () => db.newClient()));
      await Promise.all(clients.map((cl, i) => adjust(p.id, i + 1, "restock", null, who.admin(), cl)));
      expect((await db.su.query("select stock from public.products where id=$1", [p.id])).rows[0].stock).toBe(55);
      const led = await db.su.query("select coalesce(sum(delta),0)::int as s from public.inventory_movements where product_id=$1", [p.id]);
      expect(led.rows[0].s).toBe(55); // ledger sums to the stock
    });

    it("concurrent removals never take stock below zero", async () => {
      const p = await save(null, null, { title: "Race2", slug: slug(), stock: 5 });
      const clients = await Promise.all(Array.from({ length: 8 }, () => db.newClient()));
      const results = await Promise.allSettled(clients.map((cl) => adjust(p.id, -1, "adjustment", null, who.admin(), cl)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(3);
      expect((await db.su.query("select stock from public.products where id=$1", [p.id])).rows[0].stock).toBe(0);
    });

    it("concurrent edits of the same product: exactly one wins, the other is told it is stale", async () => {
      const p = await save(null, null, { title: "Race3", slug: slug() });
      const [c1, c2] = await Promise.all([db.newClient(), db.newClient()]);
      const attempt = (cl: pg.Client, t: string) =>
        commitAs(cl, who.admin(), async () => (await cl.query("select public.admin_save_product($1,$2,$3::jsonb) as r", [p.id, p.version, JSON.stringify({ title: t })])).rows[0].r);
      const res = await Promise.allSettled([attempt(c1, "One"), attempt(c2, "Two")]);
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const lost = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect((lost.reason as Error).message).toBe("STALE_PRODUCT");
    });
  });

  // ===== authorisation and privacy ==============================================================
  describe("security", () => {
    const calls: [string, string, unknown[]][] = [
      ["admin_save_product", "public.admin_save_product($1, null, '{\"title\":\"x\",\"slug\":\"x-sec\"}'::jsonb)", [null]],
      ["admin_set_product_status", "public.admin_set_product_status($1, 'archived', null)", []],
      ["admin_delete_product", "public.admin_delete_product($1)", []],
      ["admin_adjust_stock", "public.admin_adjust_stock($1, 1, 'restock', null)", []],
      ["admin_set_stock", "public.admin_set_stock($1, 1, null)", []],
      ["admin_save_category", "public.admin_save_category(null, '{\"name\":\"n\",\"slug\":\"n-sec\"}'::jsonb)", []],
      ["admin_delete_category", "public.admin_delete_category($1)", []],
      ["admin_add_product_image", "public.admin_add_product_image($1,'plants-and-pure/products/z','https://res.cloudinary.com/t/z.jpg',null,1,1,1,'jpg')", []],
      ["admin_set_cover_image", "public.admin_set_cover_image($1, $1)", []],
      ["admin_reorder_product_images", "public.admin_reorder_product_images($1, '{}'::uuid[])", []],
      ["admin_update_image_alt", "public.admin_update_image_alt($1, 'x')", []],
      ["admin_remove_product_image", "public.admin_remove_product_image($1)", []],
      ["admin_list_products", "public.admin_list_products(null,null,null,1,20)", []],
      ["admin_get_product", "public.admin_get_product($1)", []],
      ["admin_list_categories", "public.admin_list_categories()", []],
    ];

    for (const [name, sql, p] of calls) {
      it(`${name}: anonymous visitors cannot call it (permission denied)`, async () => {
        const params = sql.includes("$1") && !p.length ? [fx.products[0].id] : p.length ? [fx.products[0].id] : [];
        await expectPgError(asRole(c, who.anon, () => c.query(`select ${sql}`, params)), "42501");
      });
      it(`${name}: a signed-in customer is refused (FORBIDDEN) and nothing changes`, async () => {
        const params = sql.includes("$1") ? [fx.products[0].id] : [];
        await expectBiz(asRole(c, who.alice(), () => c.query(`select ${sql}`, params)), "FORBIDDEN");
      });
    }

    it("service_role is not an admin identity either: the admin functions need a signed-in admin", async () => {
      await expectBiz(commitAs(c, { role: "service_role" }, () => c.query("select public.admin_list_categories()")), "FORBIDDEN");
    });

    it("customers and visitors cannot read internal product columns, the ledger or the audit log", async () => {
      for (const w of [who.anon, who.alice()]) {
        await expectPgError(asRole(c, w, () => c.query("select sku from public.products")), "42501");
        await expectPgError(asRole(c, w, () => c.query("select created_by, updated_by, version, low_stock_threshold, status from public.products")), "42501");
        await expectPgError(asRole(c, w, () => c.query("select * from public.products")), "42501");
      }
      // ledger and audit log: no access at all for visitors, and RLS shows a customer zero rows
      await expectPgError(asRole(c, who.anon, () => c.query("select * from public.inventory_movements")), "42501");
      await expectPgError(asRole(c, who.anon, () => c.query("select * from public.audit_log")), "42501");
      expect((await asRole(c, who.alice(), () => c.query("select * from public.inventory_movements"))).rowCount).toBe(0);
      expect((await asRole(c, who.alice(), () => c.query("select * from public.audit_log"))).rowCount).toBe(0);
      expect((await db.su.query("select 1 from public.audit_log limit 1")).rowCount).toBe(1); // ...although rows exist
    });

    it("the storefront columns remain readable, and filtering/searching on them still works for visitors", async () => {
      const r = await asRole(c, who.anon, () => c.query(
        `select id, category_id, title, slug, tagline, description, flavor_notes, culinary_uses, ingredients, price,
                compare_at_price, currency, weight_grams, stock, is_featured, created_at, updated_at
           from public.products
          where is_active = true and archived_at is null and search_tsv @@ plainto_tsquery('english', 'test')
          order by is_featured desc, created_at desc, id limit 5`));
      expect(r.rowCount).toBeGreaterThan(0);
    });

    it("customers cannot write products, categories or images (and cannot publish)", async () => {
      const p = await readyProduct();
      const r1 = await asRole(c, who.alice(), () => c.query("update public.products set is_active = true where id = $1 returning id", [p.id]));
      expect(r1.rowCount).toBe(0); // RLS hides the row from the update
      await expectPgError(asRole(c, who.alice(), () => c.query("insert into public.categories (name, slug) values ('x','x-cust')")), "42501");
      await expectPgError(asRole(c, who.alice(), () => c.query("insert into public.product_images (product_id, cloudinary_public_id, url) values ($1,'plants-and-pure/products/q','https://res.cloudinary.com/t/q.jpg')", [p.id])), "42501");
      await expectPgError(asRole(c, who.anon, () => c.query("update public.categories set is_active = false")), "42501");
      expect((await db.su.query("select status from public.products where id=$1", [p.id])).rows[0].status).toBe("draft");
    });

    it("the audit log names the real admin for product, status and image changes", async () => {
      const p = await readyProduct();
      await setStatus(p.id, "published");
      await save(p.id, null, { price: 31 });
      const a = await db.su.query(
        `select action, actor_id, changes from public.audit_log where table_name = 'products' and record_id = $1 order by id`, [p.id]);
      expect(a.rows.map((r) => r.action)).toEqual(["INSERT", "UPDATE", "UPDATE"]);
      expect(a.rows.every((r) => r.actor_id === admin)).toBe(true);
      expect(a.rows[1].changes.is_active).toMatchObject({ old: false, new: true });
      expect(a.rows[2].changes.price).toMatchObject({ old: 25, new: 31 });
      const imgs = await db.su.query("select actor_id from public.audit_log where table_name='product_images' and changes ->> 'product_id' = $1", [p.id]);
      expect(imgs.rowCount).toBeGreaterThan(0);
      expect(imgs.rows.every((r) => r.actor_id === admin)).toBe(true);
    });

    it("audit and ledger records cannot be edited or deleted by the app roles", async () => {
      await expectPgError(commitAs(c, { role: "service_role" }, () => c.query("update public.audit_log set action = 'DELETE'")), "42501");
      await expectPgError(commitAs(c, who.admin(), () => c.query("delete from public.inventory_movements")), "42501");
    });
  });

  // ===== admin read functions ====================================================================
  describe("admin lists", () => {
    it("lists, searches, filters by status and category, paginates; LIKE wildcards are matched literally", async () => {
      const tag = uuid().slice(0, 6);
      const mk = (t: string, extra: Json = {}) => save(null, null, { title: `${tag} ${t}`, slug: `${tag}-${slug()}`, ...extra });
      const a = await mk("Alpha cumin", { sku: `AL-${tag}` });
      await mk("Beta ginger");
      await mk("100% pure");
      const full = await readyProduct({ title: `${tag} Gamma`, category_id: fx.categoryId });
      await setStatus(full.id, "published");

      const all = await rpc<Json>(who.admin(), "public.admin_list_products($1,null,null,1,20)", [tag]);
      expect(all.total).toBe(4);
      const bySku = await rpc<Json>(who.admin(), "public.admin_list_products($1,null,null,1,20)", [`al-${tag}`]);
      expect(bySku.items.map((i: Json) => i.id)).toEqual([a.id]);
      const pub = await rpc<Json>(who.admin(), "public.admin_list_products($1,'published',null,1,20)", [tag]);
      expect(pub.items).toHaveLength(1);
      expect(pub.items[0]).toMatchObject({ status: "published", category: { id: fx.categoryId } });
      expect(pub.items[0].cover_url).toContain("res.cloudinary.com");
      const cat = await rpc<Json>(who.admin(), "public.admin_list_products($1,null,$2,1,20)", [tag, fx.categoryId]);
      expect(cat.total).toBe(1);
      const paged = await rpc<Json>(who.admin(), "public.admin_list_products($1,null,null,2,3)", [tag]);
      expect(paged).toMatchObject({ total: 4, page_size: 3 });
      expect(paged.items).toHaveLength(1);
      const pct = await rpc<Json>(who.admin(), "public.admin_list_products($1,null,null,1,20)", [`${tag} 100%`]);
      expect(pct.total).toBe(1);
      const wild = await rpc<Json>(who.admin(), "public.admin_list_products('%',null,null,1,20)", []);
      expect(wild.total).toBe(1); // only the title with a literal percent sign
      await expectBiz(rpc(who.admin(), "public.admin_list_products(null,'weird',null,1,20)"), "INVALID_INPUT");
    });

    it("admin_get_product returns the product, images, what blocks publication, and recent stock history", async () => {
      const p = await save(null, null, { title: "Detail", slug: slug(), stock: 3 });
      await adjust(p.id, 2, "restock", "n");
      const d = await rpc<Json>(who.admin(), "public.admin_get_product($1)", [p.id]);
      expect(d.product).toMatchObject({ id: p.id, status: "draft", sku: null });
      expect(d.problems).toEqual(expect.arrayContaining(["description_missing", "image_missing", "category_missing"]));
      expect(d.movements.map((m: Json) => m.reason)).toEqual(["restock", "initial"]);
      expect(d.images).toEqual([]);
    });
  });

  // ===== migration safety ======================================================================
  describe("migration safety", () => {
    it("existing products and categories are preserved with sensible values", async () => {
      const r = await db.su.query("select count(*)::int as n from public.categories");
      expect(r.rows[0].n).toBeGreaterThanOrEqual(3);
      const cats = await db.su.query("select slug, is_active from public.categories where slug in ('culinary-spices','herbal-infusions','pure-botanical-oils')");
      expect(cats.rows.every((x) => x.is_active === true)).toBe(true);
    });

    it("the rollback script runs, keeps all rows, and migration 06 can be applied again afterwards", async () => {
      const second = await setupDb();
      try {
        const before = (await second.su.query("select count(*)::int as n from public.categories")).rows[0].n;
        await second.su.query(fs.readFileSync(path.join(root, "supabase/rollback/20261025010000_catalogue_management.down.sql"), "utf8"));
        // Phase 1 behaviour is back: anonymous visitors can read every column again
        const fn = await second.su.query("select count(*)::int as n from pg_proc where proname like 'admin\\_%'");
        expect(fn.rows[0].n).toBe(0);
        expect((await second.su.query("select count(*)::int as n from public.categories")).rows[0].n).toBe(before);
        await second.su.query(fs.readFileSync(path.join(root, "supabase/migrations/20261025010000_catalogue_management.sql"), "utf8"));
        const again = await second.su.query("select count(*)::int as n from pg_proc where proname like 'admin\\_%'");
        expect(again.rows[0].n).toBeGreaterThanOrEqual(15);
        // and running it again on top of itself changes nothing and does not fail (re-runnable)
        await second.su.query(fs.readFileSync(path.join(root, "supabase/migrations/20261025010000_catalogue_management.sql"), "utf8"));
        expect((await second.su.query("select count(*)::int as n from pg_proc where proname like 'admin\\_%'")).rows[0].n).toBe(again.rows[0].n);
      } finally {
        await second.drop();
      }
    });

    it("insertProduct fixtures: a published product always carries a cover image", async () => {
      const id = await insertProduct(db.su, { categoryId: fx.categoryId, slug: slug(), price: 3 });
      const r = await db.su.query("select count(*) filter (where is_cover)::int as covers from public.product_images where product_id=$1", [id]);
      expect(r.rows[0].covers).toBe(1);
    });
  });
});
