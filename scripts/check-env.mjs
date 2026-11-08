#!/usr/bin/env node
/**
 * Reports which integrations are configured. Prints variable NAMES only.
 *   node --env-file=.env.local scripts/check-env.mjs
 */
const PLACEHOLDER = /(your[-_ ]|change[-_ ]?me|replace[-_ ]?me|placeholder|^<[^>]*>$)|^[x*]{6,}$|^[a-z]{2,6}_(test|live)_x{6,}$/i;
const set = (k) => {
  const v = (process.env[k] ?? "").trim();
  return v !== "" && !PLACEHOLDER.test(v);
};
const groups = {
  supabase: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  supabaseAdmin: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  paystack: ["PAYSTACK_SECRET_KEY"],
  cloudinary: ["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
  resend: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
};
let bad = 0;
for (const [name, keys] of Object.entries(groups)) {
  const missing = keys.filter((k) => !set(k));
  console.log(`${missing.length ? "MISSING" : "ok     "}  ${name}${missing.length ? `: ${missing.join(", ")}` : ""}`);
  if (missing.length) bad++;
}
const key = process.env.PAYSTACK_SECRET_KEY ?? "";
console.log(`paystack mode: ${key.startsWith("sk_live_") ? "LIVE" : key.startsWith("sk_test_") ? "test" : "unknown"}`);
process.exit(bad ? 1 : 0);
