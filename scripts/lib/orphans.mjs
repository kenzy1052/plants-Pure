/** Pure helpers for scripts/cloudinary-orphans.mjs (kept separate so they can be unit-tested). */

/** Cloudinary resources that are old enough, ours, and still carry the "unconfirmed" tag. */
export function staleUploads(resources, { now = Date.now(), hours = 24 } = {}) {
  const cutoff = now - hours * 3600_000;
  return resources
    .filter((r) => typeof r.public_id === "string" && r.public_id.startsWith("plants-and-pure/") && Array.isArray(r.tags ?? ["unconfirmed"]) && (r.tags ?? ["unconfirmed"]).includes("unconfirmed") && Date.parse(r.created_at) < cutoff)
    .map((r) => r.public_id);
}

/** Split candidates into those still referenced by a product image row (NEVER deleted) and true orphans. */
export function splitByReference(publicIds, referenced) {
  const ref = new Set(referenced);
  return { referenced: publicIds.filter((id) => ref.has(id)), orphans: publicIds.filter((id) => !ref.has(id)) };
}
