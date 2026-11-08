/**
 * QA ONLY. A tiny stand-in for Supabase's HTTP API that runs the app's admin calls against a REAL
 * PostgreSQL database built from the project's migrations (scripts/db/lib.mjs), so the /admin pages
 * can be exercised end-to-end against the real SQL functions, triggers and RLS:
 *
 *   /auth/v1/user            -> resolves a fixed QA token to a user (no real Auth server)
 *   /rest/v1/profiles?id=eq. -> the caller's own profile row, through RLS
 *   /rest/v1/rpc/<fn>        -> calls public.<fn> as role "authenticated" with the caller's claims
 *
 * It implements nothing else (no storefront reads: use mock-supabase.mjs for those). It is NOT a
 * security boundary and must never be pointed at a real database or exposed to a network.
 *
 *   TEST_DATABASE_URL=postgres://… node scripts/qa/admin-gateway.mjs [port=54321]
 * Prints the QA session cookies as JSON on stdout once ready.
 */
import http from "node:http";
import pg from "pg";
import { buildTestDatabase } from "../db/lib.mjs";

const port = Number(process.argv[2] ?? 54321);
const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl) throw new Error("TEST_DATABASE_URL is required (a scratch server, never a real project).");

const built = await buildTestDatabase(adminUrl);
const pool = new pg.Pool({ connectionString: built.url, max: 5 });
const su = await pool.connect();

async function user(email, role) {
  const { rows } = await su.query("insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id", [email]);
  if (role !== "customer") await su.query("update public.profiles set role = $2::public.user_role where id = $1", [rows[0].id, role]);
  return { id: rows[0].id, email };
}
const admin = await user("admin@qa.example", "admin");
const customer = await user("customer@qa.example", "customer");
// The app's proxy calls auth.getClaims(), which wants a JWT-shaped token. For HS256 tokens the client then
// asks the Auth server (this gateway) to verify it, so the signature part is a placeholder here.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (u) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.qa-signature`;
const tokens = { [jwt(admin)]: admin, [jwt(customer)]: customer };
const tokenOf = (u) => Object.keys(tokens).find((t) => tokens[t] === u);

// Fixture data (clearly fake): two categories, one inactive.
await su.query(`insert into public.categories (name, slug, display_order, is_active) values
  ('QA Spices','qa-spices',1,true), ('QA Retired','qa-retired',2,false)`);

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const body = (req) => new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => r(s ? JSON.parse(s) : {})); });
const caller = (req) => tokens[(req.headers.authorization ?? "").replace(/^Bearer /, "")] ?? null;

async function asUser(u, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: u.id })]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function rpc(u, fn, args) {
  const { rows: meta } = await su.query(
    `select p.proargnames as names, p.proargtypes::oid[] as types, t.typtype as rettype, p.proretset as isset
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
      where n.nspname = 'public' and p.proname = $1`, [fn]);
  if (!meta.length) return { status: 404, body: { code: "PGRST202", message: `no function ${fn}` } };
  const names = meta[0].names ?? [];
  const types = (await su.query("select format_type(unnest, null) as t from unnest($1::oid[])", [meta[0].types])).rows.map((r) => r.t);
  const given = Object.keys(args);
  const params = given.map((k, i) => `${k} => $${i + 1}::${types[names.indexOf(k)] ?? "text"}`).join(", ");
  const values = given.map((k) => {
    const v = args[k];
    const isArrayParam = String(types[names.indexOf(k)] ?? "").endsWith("[]"); // PostgREST maps JSON arrays to SQL arrays
    return v !== null && typeof v === "object" && !isArrayParam ? JSON.stringify(v) : v;
  });
  const composite = meta[0].rettype === "c" || meta[0].isset;
  const sql = composite ? `select to_jsonb(f.*) as r from public.${fn}(${params}) f` : `select public.${fn}(${params}) as r`;
  try {
    const rows = await asUser(u, (c) => c.query(sql, values).then((r) => r.rows));
    if (composite) return { status: 200, body: meta[0].isset ? rows.map((r) => r.r) : (rows[0]?.r ?? null) };
    return { status: 200, body: rows[0]?.r ?? null };
  } catch (e) {
    return { status: e.code === "42501" ? 403 : 400, body: { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null } };
  }
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }).end();
  const u = new URL(req.url, `http://localhost:${port}`);
  const who = caller(req);
  try {
    if (u.pathname === "/auth/v1/user") return who ? json(res, 200, { id: who.id, email: who.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} }) : json(res, 401, { message: "invalid JWT" });
    if (u.pathname === "/rest/v1/profiles" && who) {
      const id = (u.searchParams.get("id") ?? "").replace(/^eq\./, "");
      const rows = await asUser(who, (c) => c.query("select id, role from public.profiles where id = $1", [id]).then((r) => r.rows));
      const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows.length ? json(res, 200, rows[0]) : json(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows" });
      return json(res, 200, rows);
    }
    const m = u.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (m && req.method === "POST") {
      if (!who) return json(res, 401, { message: "JWT required" });
      const r = await rpc(who, m[1], await body(req));
      return json(res, r.status, r.body);
    }
    json(res, 404, { message: `QA gateway: ${req.method} ${u.pathname} is not implemented` });
  } catch (e) {
    json(res, 500, { message: String(e?.message ?? e) });
  }
}).listen(port, () => {
  const session = (t, uu) => ({ access_token: t, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "qa-refresh", user: { id: uu.id, email: uu.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } });
  const cookie = (t, uu) => `base64-${Buffer.from(JSON.stringify(session(t, uu))).toString("base64url")}`;
  console.log(JSON.stringify({ ready: true, port, admin: { id: admin.id, cookie: cookie(tokenOf(admin), admin) }, customer: { id: customer.id, cookie: cookie(tokenOf(customer), customer) }, db: built.url }));
});

process.on("SIGTERM", async () => { await su.release(); await pool.end(); await built.drop().catch(() => {}); process.exit(0); });
