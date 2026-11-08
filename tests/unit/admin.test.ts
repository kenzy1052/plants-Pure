import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimitsForTests } from "@/lib/api/rate-limit";
import { __setCloudinaryFetchForTests } from "@/lib/cloudinary/server";
import { mapAdminDbError } from "@/lib/admin/db-errors";
import { createProductSchema, slugify, statusSchema, stockSchema, updateProductSchema, categorySchema } from "@/lib/admin/schemas";
import { fakeAdmin, jsonRequest, restoreEnv, setEnv } from "./helpers";

let role: "admin" | "customer" | null = "admin";
let db = fakeAdmin({});

vi.mock("@/lib/api/auth", async () => {
  const { Errors } = await import("@/lib/api/errors");
  return {
    getSessionUser: async () => null,
    requireUser: async () => { if (!role) throw Errors.unauthorized(); return { id: "u1", email: "a@b.c" }; },
    requireRole: async (allowed: string[]) => {
      if (!role) throw Errors.unauthorized();
      if (!allowed.includes(role)) throw Errors.forbidden();
      return { id: "u1", email: "a@b.c", role };
    },
  };
});
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => db.client }));

const ID = "11111111-1111-4111-8111-111111111111";
const IMG = "22222222-2222-4222-8222-222222222222";
const ctx = (id: string = ID) => ({ params: Promise.resolve({ id }) });
const url = (p: string) => `http://localhost:3000${p}`;

beforeEach(() => { setEnv(); __resetRateLimitsForTests(); role = "admin"; db = fakeAdmin({}); });
afterEach(() => { __setCloudinaryFetchForTests(undefined); restoreEnv(); });

const product = (over: Record<string, unknown> = {}) => ({ id: ID, title: "Cumin", slug: "cumin", status: "draft", version: 1, ...over });

describe("schemas", () => {
  it("slugify makes URL-safe slugs", () => {
    expect(slugify("Turmeric Powder (100 g)")).toBe("turmeric-powder-100-g");
    expect(slugify("Café & Crème")).toBe("cafe-and-creme");
    expect(slugify("  --Ginger--  ")).toBe("ginger");
    expect(slugify("🌿🌿")).toBe("");
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
  it("prices: at most two decimals, within range, original price above selling price", () => {
    const ok = (o: object) => createProductSchema.safeParse({ title: "Cumin", ...o }).success;
    expect(ok({ price: 12.5 })).toBe(true);
    expect(ok({ price: 12.555 })).toBe(false);
    expect(ok({ price: -1 })).toBe(false);
    expect(ok({ price: 1_000_001 })).toBe(false);
    expect(ok({ price: "12" })).toBe(false);
    expect(ok({ price: 10, compare_at_price: 10 })).toBe(false);
    expect(ok({ price: 10, compare_at_price: 12 })).toBe(true);
  });
  it("is strict: unknown or privileged fields are rejected, not ignored", () => {
    for (const extra of [{ is_active: true }, { status: "published" }, { created_by: "x" }, { role: "admin" }, { version: 9 }]) {
      expect(createProductSchema.safeParse({ title: "Cumin", ...extra }).success).toBe(false);
      expect(updateProductSchema.safeParse(extra).success).toBe(false);
    }
    expect(updateProductSchema.safeParse({ stock: 5 }).success).toBe(false); // stock changes use the stock endpoint
  });
  it("normalises empty optional text to null and trims", () => {
    const r = updateProductSchema.parse({ tagline: "  ", sku: "", title: "  Cumin  " });
    expect(r).toMatchObject({ tagline: null, sku: null, title: "Cumin" });
  });
  it("blocks multi-line titles and bad SKUs", () => {
    expect(createProductSchema.safeParse({ title: "a\nb" }).success).toBe(false);
    expect(createProductSchema.safeParse({ title: "Cumin", sku: "bad sku!" }).success).toBe(false);
    expect(createProductSchema.safeParse({ title: "Cumin", sku: "TM-001" }).success).toBe(true);
  });
  it("status, stock and category inputs", () => {
    expect(statusSchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(stockSchema.safeParse({ mode: "adjust", delta: 0, reason: "restock" }).success).toBe(false);
    expect(stockSchema.safeParse({ mode: "adjust", delta: 1.5, reason: "restock" }).success).toBe(false);
    expect(stockSchema.safeParse({ mode: "adjust", delta: 5, reason: "sale" }).success).toBe(false); // reserved for verified payments
    expect(stockSchema.safeParse({ mode: "adjust", delta: -5, reason: "adjustment", note: "damaged" }).success).toBe(true);
    expect(stockSchema.safeParse({ mode: "set", quantity: -1 }).success).toBe(false);
    expect(stockSchema.safeParse({ mode: "set", quantity: 10 }).success).toBe(true);
    expect(categorySchema.safeParse({ name: "A" }).success).toBe(false);
    expect(categorySchema.safeParse({ name: "Spices", slug: "Bad Slug" }).success).toBe(false);
  });
});

describe("mapAdminDbError", () => {
  const m = (message: string, code = "P0001", details = "") => mapAdminDbError({ message, code, details });
  it("maps business-rule codes to specific, safe responses", () => {
    expect(m("FORBIDDEN").status).toBe(403);
    expect(m("NOT_FOUND").status).toBe(404);
    expect(m("STALE_PRODUCT")).toMatchObject({ status: 409, code: "stale_product" });
    expect(m("SLUG_LOCKED").status).toBe(409);
    expect(m("PRODUCT_ARCHIVED").status).toBe(409);
    expect(m("CATEGORY_IN_USE").status).toBe(409);
    expect(m("PRODUCT_HAS_ORDERS").status).toBe(409);
    expect(m("INVALID_INPUT", "P0001", "unknown field: x")).toMatchObject({ status: 422 });
  });
  it("PUBLICATION_REQUIREMENTS lists what is missing in plain words", () => {
    const e = m("PUBLICATION_REQUIREMENTS", "P0001", "description_missing|image_missing");
    expect(e).toMatchObject({ status: 422, code: "publication_requirements" });
    expect((e.details as { messages: string[] }).messages).toEqual(["Add a description (at least 10 characters).", "Upload at least one product image."]);
  });
  it("stock errors explain the shortfall", () => {
    const e = m("INVALID_STOCK", "P0001", "stock is 2, cannot remove 3");
    expect(e.message).toContain("only 2");
  });
  it("constraint violations name the field; unknown errors are never forwarded", () => {
    expect(mapAdminDbError({ code: "23505", message: 'duplicate key value violates unique constraint "products_slug_key"' })).toMatchObject({ status: 409, code: "slug_taken" });
    expect(mapAdminDbError({ code: "23505", message: 'duplicate key value violates unique constraint "products_sku_ci_key"' })).toMatchObject({ code: "sku_taken" });
    expect(mapAdminDbError({ code: "23505", message: 'duplicate key value violates unique constraint "categories_name_ci_key"' })).toMatchObject({ code: "name_taken" });
    expect(mapAdminDbError({ code: "23514", message: 'new row violates check constraint "products_price_nonneg"' })).toMatchObject({ status: 422, details: { field: "price" } });
    expect(mapAdminDbError({ code: "23503", message: 'violates foreign key constraint "products_category_id_fkey"' })).toMatchObject({ code: "category_not_found" });
    expect(mapAdminDbError({ code: "42501", message: "permission denied" }).status).toBe(403);
    const unknown = mapAdminDbError({ code: "XX000", message: 'secret internals password=hunter2 at "db-host"' });
    expect(unknown.status).toBe(502);
    expect(JSON.stringify(unknown)).not.toContain("hunter2");
  });
});

describe("admin product routes", () => {
  const importRoute = async <T = Record<string, (...a: never[]) => Promise<Response>>>(p: string) => (await import(p)) as T;
  const create = async (body: unknown, headers: Record<string, string> = {}) =>
    (await import("@/app/api/admin/products/route")).POST(jsonRequest(url("/api/admin/products"), body, headers));
  void importRoute;

  it("refuses anonymous visitors (401), customers (403) and cross-site requests (403) before touching the database", async () => {
    role = null;
    expect((await create({ title: "Cumin" })).status).toBe(401);
    role = "customer";
    expect((await create({ title: "Cumin" })).status).toBe(403);
    role = "admin";
    expect((await create({ title: "Cumin" }, { origin: "https://evil.example" })).status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it("validates input on the server with field messages and never calls the database for bad input", async () => {
    const res = await create({ title: "x", price: -5, is_active: true });
    expect(res.status).toBe(422);
    expect(db.calls).toHaveLength(0);
    const bad = await create({ title: "Cumin", price: "12" });
    expect(bad.status).toBe(422);
    expect((await create("not json")).status).toBe(400);
    expect((await (await import("@/app/api/admin/products/route")).POST(new Request(url("/api/admin/products"), { method: "POST", headers: { origin: "http://localhost:3000" }, body: "{}" }))).status).toBe(415);
  });

  it("creates a draft, deriving the slug from the title, and sends only validated fields", async () => {
    db = fakeAdmin({ admin_save_product: () => ({ data: product({ slug: "turmeric-powder" }) }) });
    const res = await create({ title: "Turmeric Powder", price: 25, flavor_notes: ["earthy"] });
    expect(res.status).toBe(201);
    expect(db.calls[0]).toEqual({ fn: "admin_save_product", args: { p_id: null, p_expected_version: null, p_data: { title: "Turmeric Powder", price: 25, flavor_notes: ["earthy"], slug: "turmeric-powder" } } });
  });

  it("rejects a title that produces no usable slug", async () => {
    expect((await create({ title: "🌿🌿" })).status).toBe(422);
  });

  it("surfaces a duplicate slug as 409 slug_taken", async () => {
    db = fakeAdmin({ admin_save_product: () => ({ error: { code: "23505", message: 'duplicate key value violates unique constraint "products_slug_key"' } }) });
    const res = await create({ title: "Cumin" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("slug_taken");
  });

  it("edits with optimistic locking and maps a stale edit to 409", async () => {
    const { PATCH } = await import("@/app/api/admin/products/[id]/route");
    db = fakeAdmin({ admin_save_product: () => ({ error: { code: "P0001", message: "STALE_PRODUCT" } }) });
    const res = await PATCH(jsonRequest(url(`/api/admin/products/${ID}`), { title: "New", expectedVersion: 3 }, {}, "PATCH"), ctx());
    expect(res.status).toBe(409);
    expect(db.calls[0]!.args).toEqual({ p_id: ID, p_expected_version: 3, p_data: { title: "New" } });
  });

  it("path ids must be UUIDs", async () => {
    const { PATCH } = await import("@/app/api/admin/products/[id]/route");
    const res = await PATCH(jsonRequest(url("/api/admin/products/not-a-uuid"), { title: "x" }, {}, "PATCH"), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
    expect(db.calls).toHaveLength(0);
  });

  it("publishing an incomplete product returns the list of what is missing", async () => {
    const { POST } = await import("@/app/api/admin/products/[id]/status/route");
    db = fakeAdmin({ admin_set_product_status: () => ({ error: { code: "P0001", message: "PUBLICATION_REQUIREMENTS", details: "price_invalid|image_missing" } }) });
    const res = await POST(jsonRequest(url(`/api/admin/products/${ID}/status`), { status: "published" }), ctx());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("publication_requirements");
    expect(body.error.details.messages).toHaveLength(2);
    expect((await POST(jsonRequest(url(`/api/admin/products/${ID}/status`), { status: "sold" }), ctx())).status).toBe(422);
  });

  it("stock: validates, forwards the right operation, never accepts reason 'sale'", async () => {
    const { POST } = await import("@/app/api/admin/products/[id]/stock/route");
    db = fakeAdmin({
      admin_adjust_stock: () => ({ data: { product_id: ID, stock: 12, delta: 5 } }),
      admin_set_stock: () => ({ data: { product_id: ID, stock: 7, delta: -1 } }),
    });
    const post = (b: unknown) => POST(jsonRequest(url(`/api/admin/products/${ID}/stock`), b), ctx());
    expect((await post({ mode: "adjust", delta: 5, reason: "restock", note: "delivery" })).status).toBe(200);
    expect(db.calls[0]).toEqual({ fn: "admin_adjust_stock", args: { p_product_id: ID, p_delta: 5, p_reason: "restock", p_note: "delivery" } });
    expect((await post({ mode: "set", quantity: 7 })).status).toBe(200);
    expect(db.calls[1]).toEqual({ fn: "admin_set_stock", args: { p_product_id: ID, p_quantity: 7, p_note: null } });
    for (const bad of [{ mode: "adjust", delta: 0, reason: "restock" }, { mode: "adjust", delta: 2, reason: "sale" }, { mode: "set", quantity: -3 }, { mode: "adjust", delta: 1.2, reason: "restock" }, { delta: 3 }]) {
      expect((await post(bad)).status).toBe(422);
    }
    expect(db.calls).toHaveLength(2);
  });

  it("deleting maps 'has orders' to a 409 that tells the admin to archive", async () => {
    const { DELETE } = await import("@/app/api/admin/products/[id]/route");
    db = fakeAdmin({ admin_delete_product: () => ({ error: { code: "P0001", message: "PRODUCT_HAS_ORDERS" } }) });
    const res = await DELETE(jsonRequest(url(`/api/admin/products/${ID}`), {}, {}, "DELETE"), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toContain("Archive");
  });
});

describe("admin category routes", () => {
  it("creates with a derived slug; surfaces duplicates; only admins", async () => {
    const { POST } = await import("@/app/api/admin/categories/route");
    db = fakeAdmin({ admin_save_category: (a) => ({ data: a.p_data }) });
    role = "customer";
    expect((await POST(jsonRequest(url("/api/admin/categories"), { name: "Teas" }))).status).toBe(403);
    role = "admin";
    const res = await POST(jsonRequest(url("/api/admin/categories"), { name: "Teas & Tisanes" }));
    expect(res.status).toBe(201);
    expect(db.calls[0]!.args).toEqual({ p_id: null, p_data: { name: "Teas & Tisanes", slug: "teas-and-tisanes" } });
    db = fakeAdmin({ admin_save_category: () => ({ error: { code: "23505", message: 'violates unique constraint "categories_name_ci_key"' } }) });
    expect((await (await POST(jsonRequest(url("/api/admin/categories"), { name: "Teas" }))).json()).error.code).toBe("name_taken");
  });
  it("deleting a category in use is a 409", async () => {
    const { DELETE } = await import("@/app/api/admin/categories/[id]/route");
    db = fakeAdmin({ admin_delete_category: () => ({ error: { code: "P0001", message: "CATEGORY_IN_USE" } }) });
    expect((await DELETE(jsonRequest(url(`/api/admin/categories/${ID}`), {}, {}, "DELETE"), ctx())).status).toBe(409);
  });
});

describe("admin image routes", () => {
  const images = [{ id: IMG, url: "u", public_id: "plants-and-pure/products/a", alt_text: null, position: 0, is_cover: true }];
  const cloudMock = (calls: { method?: string; url: string }[], fail = false) =>
    vi.fn(async (u: string, init?: RequestInit) => {
      calls.push({ method: init?.method, url: u });
      return fail ? new Response("{}", { status: 500 }) : new Response("{}", { status: 200 });
    });

  it("reorder / cover / alt are forwarded to the right database functions", async () => {
    const { PATCH } = await import("@/app/api/admin/products/[id]/images/route");
    db = fakeAdmin({
      admin_reorder_product_images: () => ({ data: images }),
      admin_set_cover_image: () => ({ data: images }),
      admin_update_image_alt: () => ({ data: images }),
    });
    const patch = (b: unknown) => PATCH(jsonRequest(url(`/api/admin/products/${ID}/images`), b, {}, "PATCH"), ctx());
    expect((await patch({ action: "reorder", imageIds: [IMG] })).status).toBe(200);
    expect((await patch({ action: "cover", imageId: IMG })).status).toBe(200);
    expect((await patch({ action: "alt", imageId: IMG, altText: "Cumin seeds" })).status).toBe(200);
    expect(db.calls.map((c) => c.fn)).toEqual(["admin_reorder_product_images", "admin_set_cover_image", "admin_update_image_alt"]);
    expect((await patch({ action: "reorder", imageIds: ["nope"] })).status).toBe(422);
    expect((await patch({ action: "alt", imageId: IMG, altText: "x".repeat(201) })).status).toBe(422);
  });

  it("removal deletes the Cloudinary file only AFTER the database succeeds, and only when unreferenced", async () => {
    const { DELETE } = await import("@/app/api/admin/products/[id]/images/route");
    const calls: { method?: string; url: string }[] = [];
    __setCloudinaryFetchForTests(cloudMock(calls) as never);
    const del = () => DELETE(jsonRequest(url(`/api/admin/products/${ID}/images`), { imageId: IMG }, {}, "DELETE"), ctx());

    db = fakeAdmin({ admin_remove_product_image: () => ({ error: { code: "P0001", message: "PUBLICATION_REQUIREMENTS", details: "image_missing" } }) });
    expect((await del()).status).toBe(422);
    expect(calls).toHaveLength(0); // database refused -> the file is untouched

    db = fakeAdmin({ admin_remove_product_image: () => ({ data: { public_id: "plants-and-pure/products/a", still_referenced: true, images: [] } }) });
    expect(((await (await del()).json()).data.cloudinary)).toBe("kept");
    expect(calls).toHaveLength(0); // shared with another product -> kept

    db = fakeAdmin({ admin_remove_product_image: () => ({ data: { public_id: "plants-and-pure/products/a", still_referenced: false, images } }) });
    expect(((await (await del()).json()).data.cloudinary)).toBe("deleted");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("DELETE");
  });

  it("a failed Cloudinary delete is reported but does not fail the request (the record is already gone)", async () => {
    const { DELETE } = await import("@/app/api/admin/products/[id]/images/route");
    __setCloudinaryFetchForTests(cloudMock([], true) as never);
    db = fakeAdmin({ admin_remove_product_image: () => ({ data: { public_id: "plants-and-pure/products/a", still_referenced: false, images: [] } }) });
    const res = await DELETE(jsonRequest(url(`/api/admin/products/${ID}/images`), { imageId: IMG }, {}, "DELETE"), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).data.cloudinary).toBe("failed");
  });
});

describe("POST /api/uploads/confirm", () => {
  const confirm = async (b: unknown = { productId: ID, publicId: "plants-and-pure/products/a", altText: "Cumin" }) =>
    (await import("@/app/api/uploads/confirm/route")).POST(jsonRequest(url("/api/uploads/confirm"), b));
  const asset = (over: Record<string, unknown> = {}) => ({
    public_id: "plants-and-pure/products/a", secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/plants-and-pure/products/a.jpg",
    format: "jpg", width: 800, height: 600, bytes: 120_000, tags: ["unconfirmed"], ...over,
  });
  const cloud = (a: Record<string, unknown>, log: { method?: string; url: string }[] = []) =>
    vi.fn(async (u: string, init?: RequestInit) => {
      log.push({ method: init?.method, url: u });
      if (u.includes("/resources/image/upload/") && !init?.method) return new Response(JSON.stringify(a), { status: 200 });
      return new Response("{}", { status: 200 });
    });

  it("records the image through the admin function using Cloudinary's own facts, then removes the unconfirmed tag", async () => {
    const log: { method?: string; url: string }[] = [];
    __setCloudinaryFetchForTests(cloud(asset(), log) as never);
    db = fakeAdmin({ admin_add_product_image: () => ({ data: [{ id: IMG, is_cover: true }] }) });
    const res = await confirm();
    expect(res.status).toBe(201);
    expect(db.calls[0]).toEqual({
      fn: "admin_add_product_image",
      args: { p_product_id: ID, p_public_id: "plants-and-pure/products/a", p_url: asset().secure_url, p_alt: "Cumin", p_width: 800, p_height: 600, p_bytes: 120_000, p_format: "jpg" },
    });
    expect(log.some((l) => l.url.endsWith("/image/tags"))).toBe(true);
  });

  it("refuses an address that is not on our Cloudinary account, and an asset that was not freshly uploaded", async () => {
    __setCloudinaryFetchForTests(cloud(asset({ secure_url: "https://res.cloudinary.com/someone-else/image/upload/a.jpg" })) as never);
    expect((await confirm()).status).toBe(422);
    __setCloudinaryFetchForTests(cloud(asset({ tags: [] })) as never);
    expect((await confirm()).status).toBe(409);
    expect(db.calls).toHaveLength(0);
  });

  it("a duplicate attach keeps the file (it is in use); an archived/missing product removes the orphan", async () => {
    const log: { method?: string; url: string }[] = [];
    __setCloudinaryFetchForTests(cloud(asset(), log) as never);
    db = fakeAdmin({ admin_add_product_image: () => ({ error: { code: "23505", message: 'violates unique constraint "product_images_unique_asset"' } }) });
    expect((await confirm()).status).toBe(409);
    expect(log.some((l) => l.method === "DELETE")).toBe(false);

    log.length = 0;
    db = fakeAdmin({ admin_add_product_image: () => ({ error: { code: "P0001", message: "PRODUCT_ARCHIVED" } }) });
    expect((await confirm()).status).toBe(409);
    expect(log.some((l) => l.method === "DELETE")).toBe(true);

    log.length = 0;
    db = fakeAdmin({ admin_add_product_image: () => ({ error: { code: "XX000", message: "connection reset" } }) });
    expect((await confirm()).status).toBe(502);
    expect(log.some((l) => l.method === "DELETE")).toBe(false); // possibly temporary: keep for a retry, the sweep script cleans if abandoned
  });
});
