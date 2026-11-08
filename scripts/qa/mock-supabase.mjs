#!/usr/bin/env node
/**
 * QA ONLY — a small stand-in for the parts of Supabase's REST API (PostgREST) that the storefront uses,
 * so the site can be exercised in a sandbox with no network. It serves CLEARLY FAKE records (names start
 * with "QA ") and understands just the query features data.ts uses: select (with the product_images and
 * categories embeds), eq / neq / is.null filters, or(ilike, wfts), order, limit/offset, exact counts,
 * HEAD count requests, and the 416 "range not satisfiable" answer.
 *
 * It is NOT a PostgREST emulation you can rely on for fidelity: real behaviour is checked against a real
 * database with `npm run test:live` (see docs/STOREFRONT.md). Never used in production.
 *   node scripts/qa/mock-supabase.mjs [port=54321]
 */
import http from "node:http";

const port = Number(process.argv[2] ?? 54321);
const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "qa-cloud";
const cats = ["Culinary Spices", "Herbal Infusions", "Pure Botanical Oils", "QA Empty Category", "QA Inactive Category"].map((name, i) => ({
  id: `c-${i}`, name, slug: name.toLowerCase().replace(/\W+/g, "-"), description: null, display_order: i, is_active: name !== "QA Inactive Category",
}));
// Mirrors migration 06: the public role may read only these product columns (column-level GRANT), and only
// active categories (RLS). Selecting anything else is a permission error, as it would be on the real database.
const PUBLIC_PRODUCT_COLUMNS = new Set(["id", "category_id", "title", "slug", "tagline", "description", "flavor_notes", "culinary_uses", "ingredients", "price", "compare_at_price", "currency", "weight_grams", "stock", "is_featured", "created_at", "updated_at", "is_active", "archived_at", "search_tsv"]);
const img = (n, cover = false, host = "res.cloudinary.com") => ({ url: `https://${host}/${cloud}/image/upload/v1/plants-and-pure/products/qa-${n}.jpg`, alt_text: `QA photo ${n}`, position: n, is_cover: cover });

const products = [];
for (let i = 1; i <= 30; i++) {
  products.push({
    id: `p-${i}`, category_id: cats[i % 3].id, title: `QA product ${i}`, slug: `qa-product-${i}`, tagline: i % 4 === 0 ? `QA tagline ${i}` : null,
    description: `QA description for product ${i}, used only for layout testing.`, flavor_notes: i === 1 ? ["QA note one", "QA note two"] : [],
    culinary_uses: i === 1 ? "QA usage text." : null, ingredients: i === 1 ? "QA ingredient list" : null,
    price: 20 + i * 7.5, compare_at_price: i === 2 ? 120 : null, weight_grams: i === 7 ? null : 100, stock: i === 3 ? 0 : 10, is_featured: [1, 5, 9].includes(i),
    image_urls: [], created_at: new Date(2026, 0, i).toISOString(), updated_at: new Date(2026, 1, i).toISOString(),
    is_active: i !== 29, archived_at: i === 30 ? new Date().toISOString() : null, // 29 = draft, 30 = archived: must never appear
    product_images: i === 1 ? [img(2), img(1, true), img(3)] : i === 4 ? [{ ...img(9, true, "example.com") }] : i % 2 ? [img(i, true)] : [],
  });
}
products[1].title = "QA product with a deliberately very long name to test line clamping and alignment in the grid";
products[1].product_images = []; // product 2: long name, no image
products[5].category_id = null; // product 6: no category

const zones = [
  { id: "z1", name: "QA zone (fee)", fee: 25, free_over: 300, is_pickup: false, is_active: true, display_order: 1 },
  { id: "z2", name: "QA collection", fee: 0, free_over: null, is_pickup: true, is_active: true, display_order: 2 },
];

function applyFilter(rows, key, expr) {
  const [op, ...rest] = expr.split(".");
  const val = rest.join(".");
  return rows.filter((r) => {
    const v = r[key];
    if (op === "eq") return String(v) === val;
    if (op === "neq") return String(v) !== val;
    if (op === "is") return val === "null" ? v == null : String(v) === val;
    return true;
  });
}
function orMatch(row, clause) {
  // or=(title.ilike.*x*,tagline.ilike.*x*,search_tsv.wfts(english).x)
  return clause.some((c) => {
    let m = c.match(/^(\w+)\.ilike\.\*(.*)\*$/);
    if (m) return String(row[m[1]] ?? "").toLowerCase().includes(m[2].toLowerCase());
    m = c.match(/^search_tsv\.wfts\(english\)\.(.*)$/);
    if (m) return `${row.title} ${row.tagline ?? ""} ${row.description ?? ""}`.toLowerCase().includes(m[1].toLowerCase());
    return false;
  });
}
const splitTop = (s) => { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch; } if (cur) out.push(cur); return out; };

function query(table, u, method) {
  let rows = table === "products" ? products : table === "categories" ? cats.filter((c) => c.is_active) : table === "delivery_zones" ? zones : null;
  if (!rows) return { status: 404, body: {} };
  if (table === "products") {
    const cols = splitTop(u.searchParams.get("select") ?? "*").map((c) => c.trim()).filter((c) => c && !c.includes("("));
    const bad = cols.filter((c) => c === "*" || !PUBLIC_PRODUCT_COLUMNS.has(c));
    if (bad.length) return { status: 401, body: { code: "42501", message: "permission denied for table products", details: `columns: ${bad.join(", ")}`, hint: null } };
  }
  rows = [...rows];
  for (const [k, v] of u.searchParams) {
    if (["select", "order", "limit", "offset", "or"].includes(k)) continue;
    rows = applyFilter(rows, k, v);
  }
  const or = u.searchParams.get("or");
  if (or) rows = rows.filter((r) => orMatch(r, splitTop(or.slice(1, -1))));
  const order = u.searchParams.get("order");
  if (order) {
    const keys = order.split(",").map((o) => { const [c, dir = "asc"] = o.split("."); return [c, dir === "desc" ? -1 : 1]; });
    rows.sort((a, b) => { for (const [c, d] of keys) { if (a[c] < b[c]) return -d; if (a[c] > b[c]) return d; } return 0; });
  }
  const total = rows.length;
  const offset = Number(u.searchParams.get("offset") ?? 0);
  const limit = u.searchParams.get("limit") ? Number(u.searchParams.get("limit")) : total;
  if (method !== "HEAD" && offset > 0 && offset >= total) return { status: 416, body: { code: "PGRST103", message: "Requested range not satisfiable", details: `An offset of ${offset} was requested, but there are only ${total} rows.`, hint: null } };
  rows = rows.slice(offset, offset + limit);
  const select = u.searchParams.get("select") ?? "*";
  const embedImages = select.includes("product_images(");
  const embedCats = select.includes("categories(");
  const out = rows.map((r) => {
    const o = { ...r };
    if (table === "products") {
      if (!embedImages) delete o.product_images; else o.product_images = [...(r.product_images ?? [])];
      if (embedCats) o.categories = cats.filter((c) => c.id === r.category_id).map(({ name, slug }) => ({ name, slug }))[0] ?? null;
    }
    return o;
  });
  return { status: 200, body: out, total, offset, count: rows.length };
}

http.createServer((req, res) => {
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,HEAD,OPTIONS");
  res.setHeader("access-control-expose-headers", "content-range");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const u = new URL(req.url, `http://localhost:${port}`);
  const m = u.pathname.match(/^\/rest\/v1\/(\w+)$/);
  if (m && (req.method === "GET" || req.method === "HEAD")) {
    const r = query(m[1], u, req.method);
    const headers = { "content-type": "application/json" };
    if (r.status === 200) headers["content-range"] = `${r.count ? `${r.offset}-${r.offset + r.count - 1}` : "*"}/${r.total}`;
    if (req.method === "HEAD") return res.writeHead(r.status === 200 ? 200 : r.status, headers).end();
    res.writeHead(r.status, headers);
    return res.end(JSON.stringify(r.body));
  }
  if (u.pathname.startsWith("/auth/v1/")) return res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ code: "no_session", message: "QA mock" }));
  res.writeHead(404).end("{}");
}).listen(port, () => console.log(`QA mock Supabase on :${port}`));
