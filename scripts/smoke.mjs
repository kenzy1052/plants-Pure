#!/usr/bin/env node
/**
 * Smoke test against a RUNNING server (default http://localhost:3000).
 *   npm run build && npm run start   (other terminal)
 *   npm run smoke
 * Checks only things that need no external service: security headers, route
 * protection, input rejection, webhook signature enforcement, health shape.
 */
const base = process.argv[2] ?? process.env.SMOKE_URL ?? "http://localhost:3000";
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${extra}`}`);
  if (!ok) failed++;
};
const j = (r) => r.json().catch(() => null);

let r = await fetch(`${base}/api/health`);
let body = await j(r);
check("health responds with minimal public shape", [200, 503].includes(r.status) && body && Object.keys(body).sort().join() === "status,time", JSON.stringify(body));
check("health sends no-store", r.headers.get("cache-control") === "no-store");

r = await fetch(`${base}/`);
check("home page renders", r.status === 200);
for (const [h, v] of [["x-content-type-options", "nosniff"], ["x-frame-options", "DENY"], ["referrer-policy", "strict-origin-when-cross-origin"]]) check(`header ${h}`, r.headers.get(h) === v, String(r.headers.get(h)));
check("x-powered-by is hidden", !r.headers.get("x-powered-by"));

r = await fetch(`${base}/account`, { redirect: "manual" });
check("/account redirects anonymous visitors to sign-in", [302, 307, 308].includes(r.status) && (r.headers.get("location") ?? "").includes("/auth/sign-in"), `${r.status} ${r.headers.get("location")}`);
r = await fetch(`${base}/auth/sign-in`);
check("sign-in page is noindex", r.status === 200 && (r.headers.get("x-robots-tag") ?? "").includes("noindex"));

r = await fetch(`${base}/api/webhooks/paystack`, { method: "POST", body: "{}", headers: { "x-paystack-signature": "00" } });
check("webhook rejects a bad signature (401, or 503 if Paystack unconfigured)", [401, 503].includes(r.status), String(r.status));

r = await fetch(`${base}/api/payments/initialize`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" });
check("initialize rejects a cross-site POST", r.status === 403, String(r.status));
r = await fetch(`${base}/api/payments/initialize`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ items: [] }) });
check("initialize rejects an invalid body (422)", r.status === 422, String(r.status));
r = await fetch(`${base}/api/uploads/sign`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: "{}" });
check("upload signing refuses anonymous callers (401/503)", [401, 503].includes(r.status), String(r.status));
r = await fetch(`${base}/api/payments/status?reference=nope`);
check("status rejects a malformed reference", r.status === 422, String(r.status));
r = await fetch(`${base}/checkout/callback?reference=PP-1-aaaaaaaaaaaa`);
check("callback page renders without crashing", r.status === 200, String(r.status));

console.log(failed ? `\n${failed} check(s) failed` : "\nAll smoke checks passed");
process.exit(failed ? 1 : 0);
