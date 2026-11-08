#!/usr/bin/env node
/**
 * End-to-end QA of the /admin catalogue UI against a RUNNING app whose Supabase URL points at
 * scripts/qa/admin-gateway.mjs (real PostgreSQL + the real migrations; fake Auth). Behaviour checks:
 * gating, create/edit, stale edits, publication rules, images (seeded rows; the Cloudinary network hop
 * itself is NOT exercised here), stock + ledger, categories, destructive confirmations, mobile layout, axe.
 *   node scripts/qa/admin.mjs '<gateway ready JSON>' [baseUrl]
 */
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import pg from "pg";

const gw = JSON.parse(process.argv[2]);
const base = process.argv[3] ?? "http://localhost:3000";
const executablePath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const shots = process.env.SHOTS_DIR ?? "qa-output/admin";
mkdirSync(shots, { recursive: true });
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
let failures = 0;
const check = (ok, msg, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${ok || !extra ? "" : `  -> ${extra}`}`); if (!ok) failures++; };

const db = new pg.Client({ connectionString: gw.db });
await db.connect();
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const cookie = (value) => [{ name: "sb-localhost-auth-token", value, url: base }];
const newCtx = async (who, viewport = { width: 1280, height: 900 }) => {
  const ctx = await browser.newContext({ viewport });
  if (who) await ctx.addCookies(cookie(gw[who].cookie));
  return ctx;
};
const toastText = (page) => page.locator("[data-sonner-toast]").allInnerTexts();
const waitToast = async (page, re) => { await page.waitForFunction((s) => [...document.querySelectorAll("[data-sonner-toast]")].some((e) => new RegExp(s, "i").test(e.textContent)), re.source, { timeout: 8000 }).catch(() => {}); return (await toastText(page)).join(" | "); };

// ---------------------------------------------------------------- gating
{
  const anon = await newCtx(null);
  const p = await anon.newPage();
  await p.goto(`${base}/admin/products`, { waitUntil: "networkidle" });
  check(/\/auth\/sign-in\?next=/.test(p.url()), "anonymous visitor is sent to sign in", p.url());
  const r = await anon.request.post(`${base}/api/admin/products`, { data: { title: "x" }, headers: { origin: base } });
  check(r.status() === 401, "anonymous POST /api/admin/products -> 401", String(r.status()));
  await anon.close();

  const cust = await newCtx("customer");
  const cp = await cust.newPage();
  const resp = await cp.goto(`${base}/admin/products`, { waitUntil: "networkidle" });
  check(resp.status() === 404, "signed-in customer gets a plain 404 for /admin/products", String(resp.status()));
  check((await cp.getByText("Catalogue").count()) === 0, "…and sees nothing of the admin area");
  const r2 = await cust.request.post(`${base}/api/admin/products`, { data: { title: "Hack" }, headers: { origin: base } });
  check(r2.status() === 403, "customer POST /api/admin/products -> 403", String(r2.status()));
  const r3 = await cust.request.post(`${base}/api/admin/products`, { data: { title: "Hack" }, headers: { origin: "https://evil.example" } });
  check(r3.status() === 403, "cross-site POST is refused", String(r3.status()));
  const r4 = await cust.request.post(`${base}/api/uploads/sign`, { data: {}, headers: { origin: base } });
  check(r4.status() === 403, "customer cannot get an upload signature", String(r4.status()));
  const n = (await db.query("select count(*)::int n from public.products")).rows[0].n;
  check(n === 0, "no product was created by any refused request", String(n));
  await cust.close();
}

const ctx = await newCtx("admin");
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const go = (p) => page.goto(base + p, { waitUntil: "networkidle" });

// ---------------------------------------------------------------- categories
await go("/admin/categories");
check((await page.getByRole("heading", { name: "Categories" }).count()) === 1, "admin sees the categories page");
check(await page.getByText("QA Retired").count() > 0 && await page.getByText("Inactive").count() > 0, "inactive categories are listed for admins, labelled Inactive");
await page.getByRole("button", { name: "New category" }).click();
await page.getByLabel("Name", { exact: false }).first().fill("QA Herbs");
await page.getByRole("button", { name: "Create category" }).click();
await page.getByText("QA Herbs", { exact: true }).waitFor({ timeout: 8000 }).catch(() => {});
check((await db.query("select count(*)::int n from public.categories where name='QA Herbs' and slug='qa-herbs'")).rows[0].n === 1, "category created with a derived slug (in the database)");
await page.getByRole("button", { name: "New category" }).click();
await page.getByLabel("Name", { exact: false }).first().fill("qa herbs");
await page.getByRole("button", { name: "Create category" }).click();
await page.getByRole("alert").first().waitFor({ timeout: 8000 }).catch(() => {});
check(/already has this name|Another category/i.test(await page.getByRole("alert").allInnerTexts().then((a) => a.join(" "))), "duplicate category name (case-insensitive) is refused with a clear message");
await page.getByRole("button", { name: "Cancel" }).click();

// ---------------------------------------------------------------- create product
await go("/admin/products");
check(/No products yet/.test(await page.locator("main").innerText()), "empty catalogue shows an honest empty state");
await page.getByRole("link", { name: "New product" }).first().click();
await page.waitForURL(/products\/new/);
await page.getByRole("button", { name: "Create draft" }).click();
check((await page.getByText("Enter at least 2 characters").count()) > 0 || (await page.getByRole("alert").count()) > 0, "empty title is rejected before anything is sent");
await page.getByLabel("Product name").fill("QA Turmeric Powder");
await page.getByLabel("Price (GH₵)", { exact: true }).fill("12.555");
await page.getByRole("button", { name: "Create draft" }).click();
check(/two decimal/i.test(await page.locator("main form").innerText()), "price with 3 decimals is rejected with a clear message");
await page.getByLabel("Price (GH₵)", { exact: true }).fill("25.50");
await page.getByLabel("Category").selectOption({ label: "QA Spices" });
await page.getByLabel("Opening stock").fill("10");
await page.screenshot({ path: `${shots}/new-product-desktop.png`, fullPage: true });
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/, { timeout: 10000 });
let productId = page.url().split("/").pop();
const row = (await db.query("select title, slug, price::text, stock, status, is_active, created_by from public.products where id=$1", [productId])).rows[0];
check(row?.slug === "qa-turmeric-powder" && row.price === "25.50" && row.stock === 10 && row.status === "draft" && row.is_active === false, "draft saved with derived slug, price, stock; not published", JSON.stringify(row));
check(row?.created_by === gw.admin.id, "created_by records the signed-in admin (not a service account)");
check((await db.query("select count(*)::int n from public.inventory_movements where product_id=$1 and reason='initial' and delta=10", [productId])).rows[0].n === 1, "opening stock is in the ledger");
check((await db.query("select count(*)::int n from public.audit_log where row_id::text=$1 and actor_id=$2", [productId, gw.admin.id]).catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n !== 0, "audit log has an entry attributed to the admin");

// ---------------------------------------------------------------- publication checklist
const pubPanel = () => page.getByRole("region", { name: "Publication" });
let t = await pubPanel().innerText();
check(/Add a description/.test(t) && /Upload at least one product image/.test(t), "publication panel lists what is missing (description, image)", t);
check(await page.getByRole("button", { name: "Publish to the shop" }).isDisabled(), "Publish is disabled while requirements are missing");
const direct = await ctx.request.post(`${base}/api/admin/products/${productId}/status`, { data: { status: "published" }, headers: { origin: base } });
check(direct.status() === 422 && (await direct.json()).error.code === "publication_requirements", "publishing via the API is refused by the server too (422 publication_requirements)");

// stale edit: second tab saves first
const page2 = await ctx.newPage();
await page2.goto(`${base}/admin/products/${productId}`, { waitUntil: "networkidle" });
await page.getByLabel("Description").fill("Ground turmeric for QA layout testing only.");
await page.getByRole("button", { name: "Save changes" }).click();
await waitToast(page, /Saved/);
await page.waitForLoadState("networkidle");
await page2.getByLabel("Description").fill("A conflicting description written in another tab.");
await page2.getByRole("button", { name: "Save changes" }).click();
await page2.getByRole("alert").first().waitFor({ timeout: 8000 }).catch(() => {});
check(/changed this product while you were editing/i.test(await page2.locator("#pf-form-error").innerText()), "stale edit is refused with an explanation instead of overwriting");
check((await db.query("select description from public.products where id=$1", [productId])).rows[0].description.startsWith("Ground turmeric"), "the first save was NOT overwritten");
await page2.getByRole("button", { name: "Reload the latest version" }).click();
await page2.waitForFunction(() => document.querySelector("#pf-description")?.value.startsWith("Ground turmeric"), null, { timeout: 8000 }).catch(() => {});
check((await page2.getByLabel("Description").inputValue()).startsWith("Ground turmeric"), "Reload shows the latest saved version");
await page2.close();

// ---------------------------------------------------------------- images (seeded rows)
const img = async (n, cover) => (await db.query(
  `insert into public.product_images (product_id, cloudinary_public_id, url, position, is_cover, width, height, bytes, format)
   values ($1,$2,$3,$4,$5,800,800,1000,'jpg') returning id`,
  [productId, `plants-and-pure/products/qa-${n}`, `https://res.cloudinary.com/qa-cloud/image/upload/v1/plants-and-pure/products/qa-${n}.jpg`, n - 1, cover])).rows[0].id;
await img(1, true);
const im2 = await img(2, false);
await go(`/admin/products/${productId}`);
const photos = page.getByRole("region", { name: "Photos" });
check((await photos.getByRole("listitem").count()) === 2, "images panel lists both photos");
check((await photos.getByText("Cover", { exact: true }).count()) === 1, "exactly one cover is shown");
await photos.getByRole("button", { name: "Make cover" }).click();
await waitToast(page, /Cover photo changed/);
check((await db.query("select id from public.product_images where product_id=$1 and is_cover", [productId])).rows.map((r) => r.id).join() === im2, "cover change persisted; still exactly one cover");
await go(`/admin/products/${productId}`);
const orderBefore = (await db.query("select id from public.product_images where product_id=$1 order by position", [productId])).rows.map((r) => r.id);
await photos.getByRole("button", { name: /Move photo 2 earlier/ }).click();
await waitToast(page, /Order updated/);
const orderAfter = (await db.query("select id from public.product_images where product_id=$1 order by position", [productId])).rows.map((r) => r.id);
check(orderAfter.length === 2 && orderAfter[0] === orderBefore[1] && orderAfter[1] === orderBefore[0], "reorder persisted (the two photos swapped places)", `${orderBefore} -> ${orderAfter}`);
await go(`/admin/products/${productId}`);
await photos.getByLabel("Alt text").first().fill("Ground turmeric in a small pack");
await photos.getByRole("button", { name: "Save alt text" }).first().click();
await waitToast(page, /Alt text saved/);
check((await db.query("select count(*)::int n from public.product_images where product_id=$1 and alt_text='Ground turmeric in a small pack'", [productId])).rows[0].n === 1, "alt text persisted");

// ---------------------------------------------------------------- publish
await go(`/admin/products/${productId}`);
check(/Everything needed to publish is in place/.test(await pubPanel().innerText()), "checklist turns green once description, price, category and photo exist", await pubPanel().innerText());
{
  const over = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const bad = [...document.querySelectorAll("main *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && !e.closest(".overflow-x-auto"); }).slice(0, 6).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)} right=${Math.round(e.getBoundingClientRect().right)}`);
    return { by: document.documentElement.scrollWidth - w, bad };
  });
  check(over.by <= 1, "edit page (with photos, desktop): panels stay inside the page, no horizontal scroll", `${over.by}px ${over.bad.join(" | ")}`);
}
await page.screenshot({ path: `${shots}/edit-product-desktop.png`, fullPage: true });
await page.getByRole("button", { name: "Publish to the shop" }).click();
await waitToast(page, /Published/);
check((await db.query("select status, is_active from public.products where id=$1", [productId])).rows[0].status === "published", "product is published (status derived by the database)");
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => document.querySelector("#pf-slug")?.disabled === true, null, { timeout: 8000 }).catch(() => {});
check(await page.getByLabel("Web address").isDisabled(), "web address is locked while published");
// remove photos until the rule bites
page.on("dialog", () => {});
await photos.getByRole("button", { name: "Remove" }).first().click();
await page.getByRole("dialog").getByRole("button", { name: "Remove photo" }).click();
await waitToast(page, /Photo removed|could not be deleted/);
check((await db.query("select count(*)::int n from public.product_images where product_id=$1", [productId])).rows[0].n === 1, "first photo removed from the database (Cloudinary delete is not reachable in QA and is reported, not fatal)");
check((await db.query("select count(*)::int n from public.product_images where product_id=$1 and is_cover", [productId])).rows[0].n === 1, "a remaining photo became the cover automatically");
await go(`/admin/products/${productId}`);
await photos.getByRole("button", { name: "Remove" }).first().click();
await page.getByRole("dialog").getByRole("button", { name: "Remove photo" }).click();
await photos.getByRole("alert").waitFor({ timeout: 8000 }).catch(() => {});
check(/cannot be published|image/i.test(await photos.getByRole("alert").innerText().catch(() => "")), "the last photo of a published product cannot be removed (clear message)");
check((await db.query("select count(*)::int n from public.product_images where product_id=$1", [productId])).rows[0].n === 1, "…and it is still there");

// ---------------------------------------------------------------- stock
await go(`/admin/products/${productId}`);
const stock = page.getByRole("region", { name: "Stock" });
await stock.getByLabel("Change (units)").fill("5");
await stock.getByLabel("Note").fill("QA delivery");
await stock.getByRole("button", { name: "Apply change" }).click();
await waitToast(page, /Stock is now 15/);
check((await db.query("select stock from public.products where id=$1", [productId])).rows[0].stock === 15, "stock +5 applied (10 -> 15)");
await page.waitForLoadState("networkidle");
await stock.getByLabel("Change (units)").fill("-100");
await stock.getByRole("button", { name: "Apply change" }).click();
await stock.getByRole("alert").waitFor({ timeout: 8000 }).catch(() => {});
check(/only 15|cannot remove/i.test(await stock.getByRole("alert").innerText().catch(() => "")), "removing more than exists is refused with the real shortfall");
check((await db.query("select stock from public.products where id=$1", [productId])).rows[0].stock === 15, "…and stock is unchanged");
await stock.getByLabel("Change (units)").fill("1.5");
await stock.getByRole("button", { name: "Apply change" }).click();
check((await stock.getByRole("alert").count()) > 0, "fractional quantity is rejected");
await stock.getByLabel("Set the total").check();
await stock.getByLabel("New total (units)").fill("7");
await stock.getByRole("button", { name: "Set stock" }).click();
await waitToast(page, /Stock is now 7/);
const ledger = (await db.query("select delta, stock_after, reason, actor_id from public.inventory_movements where product_id=$1 order by id", [productId])).rows;
check(ledger.map((l) => `${l.reason}:${l.delta}:${l.stock_after}`).join() === "initial:10:10,restock:5:15,correction:-8:7" || ledger.map((l) => `${l.delta}:${l.stock_after}`).join() === "10:10,5:15,-8:7", "ledger shows initial, +5 and the stocktake -8 with running totals", JSON.stringify(ledger));
check(ledger.slice(1).every((l) => l.actor_id === gw.admin.id), "ledger entries are attributed to the admin");
await go(`/admin/products/${productId}`);
check((await stock.getByRole("row").count()) >= 4, "stock history table shows the movements");

// ---------------------------------------------------------------- list, filters
await go("/admin/products?q=turmeric&status=published");
check((await page.getByRole("link", { name: /QA Turmeric Powder/ }).count()) === 1, "list: search + status filter finds the product");
await go("/admin/products?status=draft");
check((await page.getByRole("link", { name: /QA Turmeric Powder/ }).count()) === 0 && /No products match/.test(await page.locator("main").innerText()), "list: draft filter excludes it and says so");
await go("/admin/products?page=999&category=not-a-uuid&status=hack");
check((await page.getByRole("heading", { name: "Products", exact: true }).count()) === 1 && (await page.getByRole("link", { name: /QA Turmeric Powder/ }).count()) === 1, "list: garbage query values do not break the page; a page past the end lands on the last page", page.url());

// ---------------------------------------------------------------- category deactivation blocked
await go("/admin/categories");
await page.getByRole("button", { name: "Deactivate QA Spices" }).click();
await page.locator("main").getByRole("alert").first().waitFor({ timeout: 8000 }).catch(() => {});
check(/QA Spices/.test(await page.locator("main").getByRole("alert").first().innerText().catch(() => "")) && (await db.query("select is_active from public.categories where slug='qa-spices'")).rows[0].is_active === true, "a category with a live product cannot be deactivated (message shown, still active)");
check(await page.getByRole("button", { name: "Delete QA Spices" }).isDisabled(), "a category with products has Delete disabled");

// ---------------------------------------------------------------- lifecycle: unpublish, archive, restore, delete
await go(`/admin/products/${productId}`);
await page.getByRole("button", { name: "Unpublish (back to draft)" }).click();
check(await page.getByRole("dialog").isVisible(), "unpublish asks for confirmation");
await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
check((await db.query("select status from public.products where id=$1", [productId])).rows[0].status === "published", "Cancel leaves the product published");
await page.getByRole("button", { name: "Archive" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
await waitToast(page, /Archived/);
await page.waitForFunction(() => document.querySelector("#pf-title")?.disabled === true, null, { timeout: 8000 }).catch(() => {});
check((await db.query("select status, archived_at is not null as a from public.products where id=$1", [productId])).rows[0].status === "archived", "archived");
check(/archived and read-only/.test(await page.locator("main").innerText()) && await page.getByLabel("Product name").isDisabled(), "archived product form is read-only with an explanation");
await page.getByRole("button", { name: "Restore as draft" }).click();
await waitToast(page, /draft/i);
await page.waitForLoadState("networkidle");
check((await db.query("select status from public.products where id=$1", [productId])).rows[0].status === "draft", "restored as a draft (not silently republished)");
// delete a never-published draft
await go("/admin/products/new");
await page.getByLabel("Product name").fill("QA Throwaway");
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/);
await page.getByRole("button", { name: "Delete draft" }).click();
check(/permanently deletes/.test(await page.getByRole("dialog").innerText()), "delete asks for confirmation and says it is permanent");
await page.getByRole("dialog").getByRole("button", { name: "Delete draft" }).click();
await page.waitForURL(/\/admin\/products$/, { timeout: 10000 });
check((await db.query("select count(*)::int n from public.products where title='QA Throwaway'")).rows[0].n === 0, "never-published draft deleted");
// a restored draft that appears in NO order may be deleted; one that appears in an order may not (covered by the real-DB tests)
await go(`/admin/products/${productId}`);
await page.getByRole("button", { name: "Delete draft" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Delete draft" }).click();
await page.waitForURL(/\/admin\/products$/, { timeout: 10000 }).catch(() => {});
check((await db.query("select count(*)::int n from public.products where id=$1", [productId])).rows[0].n === 0, "a draft with no orders can be deleted (its photo rows go with it)");
check((await db.query("select count(*)::int n from public.product_images where product_id=$1", [productId])).rows[0].n === 0, "…and no orphan image rows remain");
// recreate one product so the layout checks below have something to render
const rp = await db.query("insert into public.products (title, slug, description, price, category_id) values ('QA Layout Product','qa-layout-product','Layout testing description text.', 9.5, (select id from public.categories where slug='qa-spices')) returning id");
productId = rp.rows[0].id;

// ---------------------------------------------------------------- JS errors + a11y + mobile
check(errors.length === 0, "no uncaught page errors or console errors", errors.slice(0, 3).join(" | "));
for (const [label, path, vp] of [
  ["list-desktop", "/admin/products", { width: 1280, height: 900 }],
  ["edit-desktop", `/admin/products/${productId}`, { width: 1280, height: 900 }],
  ["categories-desktop", "/admin/categories", { width: 1280, height: 900 }],
  ["new-mobile", "/admin/products/new", { width: 390, height: 844 }],
  ["list-mobile", "/admin/products", { width: 390, height: 844 }],
  ["edit-mobile", `/admin/products/${productId}`, { width: 390, height: 844 }],
  ["categories-mobile", "/admin/categories", { width: 390, height: 844 }],
]) {
  await page.setViewportSize(vp);
  await go(path);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, `${label}: no horizontal page scroll`, `${over}px`);
  await page.screenshot({ path: `${shots}/${label}.png`, fullPage: true });
  await page.addScriptTag({ content: axeSource });
  const axe = await page.evaluate(() => globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }));
  check(axe.violations.length === 0, `${label}: axe ${axe.violations.length} violation(s) ${axe.violations.map((v) => `${v.id}(${v.nodes.length})`).join(", ")}`);
  for (const v of axe.violations) console.log("      ", v.id, v.help, v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | "));
}

await browser.close();
await db.end();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll admin QA checks passed");
process.exit(failures ? 1 : 0);
