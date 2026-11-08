import { Errors } from "@/lib/api/errors";

/**
 * Small in-memory fixed-window rate limiter.
 *
 * HONEST LIMITATION: state lives in one server instance's memory. On a
 * serverless host each instance counts separately, so this blunts casual abuse
 * and runaway clients but is not a hard global cap. Supabase Auth applies its own
 * server-side limits to sign-up/sign-in/reset. A shared limiter (Postgres-backed)
 * is on the Phase 9 hardening list; the interface below will not change.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type Limit = { max: number; windowMs: number };

export function rateLimit(key: string, { max, windowMs }: Limit, now = Date.now()) {
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_BUCKETS) buckets.clear(); // fail open rather than grow without bound
  }
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return { ok: b.count <= max, remaining: Math.max(0, max - b.count), retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
}

/** First hop of x-forwarded-for (set by the host's proxy), else x-real-ip. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function enforceRateLimit(req: Request, name: string, limit: Limit, extraKey = ""): void {
  const r = rateLimit(`${name}:${clientIp(req)}:${extraKey}`, limit);
  if (!r.ok) throw Errors.tooMany(r.retryAfterSec);
}

export function __resetRateLimitsForTests() {
  buckets.clear();
}
