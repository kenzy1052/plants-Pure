#!/usr/bin/env node
/**
 * Orphan clean-up for Cloudinary uploads.
 *
 * Every direct upload is tagged "unconfirmed" and the tag is removed only when
 * the image is attached to a product (POST /api/uploads/confirm). Files that stay
 * tagged are abandoned uploads. This lists them and, ONLY with --delete, removes
 * those older than --hours (default 24).
 *
 *   node --env-file=.env.local scripts/cloudinary-orphans.mjs            # dry run
 *   node --env-file=.env.local scripts/cloudinary-orphans.mjs --delete   # delete
 *
 * Safety:
 *  - It never touches an asset without the "unconfirmed" tag.
 *  - The server records an image in the database BEFORE it removes the tag, so a failed
 *    tag removal can leave a LIVE product photo tagged "unconfirmed". The script therefore asks the
 *    database (product_images, service-role key) which candidates are still referenced and never
 *    deletes those. Without database access it still does a dry run but REFUSES to delete.
 */
import { staleUploads, splitByReference } from "./lib/orphans.mjs";
const args = process.argv.slice(2);
const doDelete = args.includes("--delete");
const hoursIdx = args.indexOf("--hours");
const hours = hoursIdx >= 0 ? Number(args[hoursIdx + 1]) : 24;
if (!Number.isFinite(hours) || hours < 1) {
  console.error("--hours must be a number >= 1");
  process.exit(2);
}

const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const key = process.env.CLOUDINARY_API_KEY;
const secret = process.env.CLOUDINARY_API_SECRET;
if (!cloud || !key || !secret) {
  console.error("Missing Cloudinary variables: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
  process.exit(2);
}
const auth = { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` };
const base = `https://api.cloudinary.com/v1_1/${cloud}`;

const all = [];
let cursor;
do {
  const url = `${base}/resources/image/tags/unconfirmed?max_results=100&tags=true${cursor ? `&next_cursor=${cursor}` : ""}`;
  const res = await fetch(url, { headers: auth });
  if (!res.ok) {
    console.error(`Cloudinary returned HTTP ${res.status}`);
    process.exit(1);
  }
  const page = await res.json();
  all.push(...(page.resources ?? []));
  cursor = page.next_cursor;
} while (cursor);
const candidates = staleUploads(all, { hours });

// Which candidates does a product still use?
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let stale = candidates;
let referencedCount = 0;
let dbChecked = false;
if (sbUrl && sbKey && candidates.length) {
  const referenced = [];
  for (let i = 0; i < candidates.length; i += 50) {
    const list = candidates.slice(i, i + 50).map((id) => `"${id.replace(/"/g, "")}"`).join(",");
    const res = await fetch(`${sbUrl}/rest/v1/product_images?select=cloudinary_public_id&cloudinary_public_id=in.(${encodeURIComponent(list)})`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    });
    if (!res.ok) {
      console.error(`Could not check the database (HTTP ${res.status}); nothing will be deleted.`);
      process.exit(1);
    }
    referenced.push(...(await res.json()).map((r) => r.cloudinary_public_id));
  }
  const split = splitByReference(candidates, referenced);
  stale = split.orphans;
  referencedCount = split.referenced.length;
  dbChecked = true;
}
if (referencedCount) console.log(`${referencedCount} candidate(s) are still used by a product and will be kept (their tag was never removed).`);

console.log(`${stale.length} unconfirmed upload(s) older than ${hours}h`);
stale.forEach((id) => console.log(`  ${id}`));
if (doDelete && !dbChecked && candidates.length) {
  console.error("Refusing to delete: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to confirm that no product uses these files.");
  process.exit(2);
}
if (!doDelete || stale.length === 0) {
  if (stale.length && !doDelete) console.log("Dry run: nothing deleted. Re-run with --delete to remove them.");
  process.exit(0);
}
for (let i = 0; i < stale.length; i += 50) {
  const batch = stale.slice(i, i + 50);
  const q = batch.map((id) => `public_ids[]=${encodeURIComponent(id)}`).join("&");
  const res = await fetch(`${base}/resources/image/upload?${q}`, { method: "DELETE", headers: auth });
  if (!res.ok) {
    console.error(`Delete failed with HTTP ${res.status}`);
    process.exit(1);
  }
}
console.log(`Deleted ${stale.length}.`);
