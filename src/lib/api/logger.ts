/**
 * Structured server logging that cannot leak secrets or customer data by accident.
 *
 * - Keys that look sensitive are replaced with "[redacted]" (tokens, passwords,
 *   authorization, api keys, cookies, signatures, access codes…).
 * - Keys that hold personal data (email, phone, name, address) are masked.
 * - Secret-shaped substrings inside any string (Paystack keys, Bearer tokens,
 *   JWTs, Resend keys) are scrubbed.
 * One JSON object per line: easy to search in Vercel / any log drain.
 */
const SECRET_KEY = /(secret|token|password|passwd|authorization|api[-_]?key|cookie|signature|service[-_]?role|access[-_]?code|authorization[-_]?url|session)/i;
const PII_KEY = /(^|[-_])(e-?mail|phone|msisdn|address|first[-_]?name|last[-_]?name|customer[-_]?name|full[-_]?name)$/i;

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\b(sk|pk|rk)_(test|live)_[A-Za-z0-9]{8,}/g, "[redacted-key]"],
  [/\bre_[A-Za-z0-9_]{16,}/g, "[redacted-key]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "[redacted-jwt]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]"],
];

export function scrub(text: string): string {
  return SECRET_PATTERNS.reduce((acc, [re, to]) => acc.replace(re, to), text);
}

export function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return scrub(value);
  if (typeof value !== "object") return value;
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(k)) out[k] = "[redacted]";
    else if (PII_KEY.test(k)) out[k] = "[pii]";
    else out[k] = redact(v, depth + 1);
  }
  return out;
}

export function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const e = err as Error & { code?: unknown; detail?: unknown; hint?: unknown };
    return {
      errorName: err.name,
      errorMessage: scrub(err.message),
      ...(e.code !== undefined ? { errorCode: String(e.code) } : {}),
      ...(process.env.NODE_ENV !== "production" && err.stack ? { stack: scrub(err.stack).split("\n").slice(0, 8) } : {}),
    };
  }
  if (err && typeof err === "object") {
    // e.g. Supabase PostgrestError (a plain object, not an Error instance)
    const o = err as { message?: unknown; code?: unknown; details?: unknown };
    return {
      errorMessage: scrub(String(o.message ?? "unknown error")),
      ...(o.code !== undefined ? { errorCode: String(o.code) } : {}),
    };
  }
  return { errorMessage: scrub(String(err)) };
}

type Level = "info" | "warn" | "error";
function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...(redact(fields) as object) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const logger = {
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
