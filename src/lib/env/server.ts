import "server-only";
import { z } from "zod";

/**
 * Server-only configuration with validation.
 *
 * Rules
 *  - Secrets live here and nowhere else. `import "server-only"` makes the build
 *    fail if any client component ever imports this file.
 *  - Errors name the MISSING VARIABLES only — never their values.
 *  - Values that are still template placeholders (sk_test_xxxx…, "your-key")
 *    count as NOT configured, so an integration can never half-work on junk.
 *  - A feature that is not configured disables itself with a clear 503 instead
 *    of crashing the whole app; in production, validateServerEnv() fails fast
 *    at start-up (see src/instrumentation.ts).
 */

export class ConfigError extends Error {
  constructor(
    public readonly feature: string,
    public readonly missing: string[],
  ) {
    super(`${feature} is not configured (missing or placeholder: ${missing.join(", ")})`);
    this.name = "ConfigError";
  }
}

// `<…>` only counts as a placeholder when it wraps the WHOLE value ("<paste key>"); a sender
// such as `Plants & Pure <orders@example.com>` is legitimate.
const PLACEHOLDER_WORDS = /(your[-_ ]|change[-_ ]?me|replace[-_ ]?me|placeholder|^<[^>]*>$)/i;

/** True for empty values, template markers and keys that are just a prefix + x's. */
export function isUnset(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return true;
  const v = value.trim();
  if (!v) return true;
  if (PLACEHOLDER_WORDS.test(v)) return true;
  if (/^[x*]{6,}$/i.test(v)) return true;
  // pk_test_xxxxxxxx / sk_test_xxxxxxxx style placeholders
  if (/^[a-z]{2,6}_(test|live)_x{6,}$/i.test(v)) return true;
  return false;
}

const optional = z.string().optional().transform((v) => (isUnset(v) ? undefined : v!.trim()));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: optional,
  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  PAYSTACK_SECRET_KEY: optional,
  CLOUDINARY_API_KEY: optional,
  CLOUDINARY_API_SECRET: optional,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: optional,
  RESEND_API_KEY: optional,
  RESEND_FROM_EMAIL: optional,
  EMAIL_MODE: z.enum(["live", "sandbox", "off"]).optional(),
  EMAIL_SANDBOX_RECIPIENT: optional,
  HEALTH_CHECK_TOKEN: optional,
});

type Raw = z.infer<typeof schema>;

export type ServerEnv = {
  nodeEnv: Raw["NODE_ENV"];
  isProduction: boolean;
  appUrl: string;
  supabase: { url?: string; anonKey?: string; serviceRoleKey?: string };
  paystack: { secretKey?: string; mode?: "test" | "live" };
  cloudinary: { cloudName?: string; apiKey?: string; apiSecret?: string };
  resend: { apiKey?: string; fromEmail?: string };
  email: { mode: "live" | "sandbox" | "off"; sandboxRecipient?: string };
  healthCheckToken?: string;
};

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const r = schema.safeParse(source);
  if (!r.success) {
    // zod messages describe the variable and expected shape, never the value
    const names = [...new Set(r.error.issues.map((i) => String(i.path[0])))];
    throw new ConfigError("Environment", names.map((n) => `${n} (invalid value)`));
  }
  const e = r.data;
  const isProduction = e.NODE_ENV === "production";
  const paystackKey = e.PAYSTACK_SECRET_KEY;
  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    appUrl: (e.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    supabase: {
      url: e.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY,
    },
    paystack: {
      secretKey: paystackKey,
      mode: paystackKey?.startsWith("sk_live_") ? "live" : paystackKey?.startsWith("sk_test_") ? "test" : undefined,
    },
    cloudinary: {
      cloudName: e.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      apiKey: e.CLOUDINARY_API_KEY,
      apiSecret: e.CLOUDINARY_API_SECRET,
    },
    resend: { apiKey: e.RESEND_API_KEY, fromEmail: e.RESEND_FROM_EMAIL },
    // Safe default: real customers are only e-mailed in production.
    email: { mode: e.EMAIL_MODE ?? (isProduction ? "live" : "sandbox"), sandboxRecipient: e.EMAIL_SANDBOX_RECIPIENT },
    healthCheckToken: e.HEALTH_CHECK_TOKEN,
  };
}

let cached: ServerEnv | undefined;
export function getServerEnv(): ServerEnv {
  return (cached ??= parseServerEnv());
}
/** test helper */
export function resetServerEnvCache() {
  cached = undefined;
}

export const FEATURES = ["supabase", "supabaseAdmin", "paystack", "cloudinary", "resend"] as const;
export type Feature = (typeof FEATURES)[number];

export function missingFor(feature: Feature, env: ServerEnv = getServerEnv()): string[] {
  const need = (pairs: [string, string | undefined][]) => pairs.filter(([, v]) => !v).map(([k]) => k);
  switch (feature) {
    case "supabase":
      return need([["NEXT_PUBLIC_SUPABASE_URL", env.supabase.url], ["NEXT_PUBLIC_SUPABASE_ANON_KEY", env.supabase.anonKey]]);
    case "supabaseAdmin":
      return need([
        ["NEXT_PUBLIC_SUPABASE_URL", env.supabase.url],
        ["SUPABASE_SERVICE_ROLE_KEY", env.supabase.serviceRoleKey],
      ]);
    case "paystack":
      return need([["PAYSTACK_SECRET_KEY", env.paystack.secretKey]]);
    case "cloudinary":
      return need([
        ["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", env.cloudinary.cloudName],
        ["CLOUDINARY_API_KEY", env.cloudinary.apiKey],
        ["CLOUDINARY_API_SECRET", env.cloudinary.apiSecret],
      ]);
    case "resend":
      return need([["RESEND_API_KEY", env.resend.apiKey], ["RESEND_FROM_EMAIL", env.resend.fromEmail]]);
  }
}

/** Throws ConfigError (variable NAMES only) when a feature cannot run. */
export function requireFeature<F extends Feature>(feature: F): ServerEnv {
  const env = getServerEnv();
  const missing = missingFor(feature, env);
  if (missing.length) throw new ConfigError(feature, missing);
  return env;
}

export type EnvReport = {
  ok: boolean;
  problems: { feature: Feature; missing: string[] }[];
  warnings: string[];
};

/**
 * Start-up validation. In production every feature is required and the process
 * refuses to start otherwise; in development problems are reported as warnings
 * so that, e.g., the storefront can be worked on without payment keys.
 */
export function validateServerEnv(env: ServerEnv = getServerEnv()): EnvReport {
  const problems = FEATURES.map((feature) => ({ feature, missing: missingFor(feature, env) })).filter((p) => p.missing.length);
  const warnings: string[] = [];
  if (env.isProduction) {
    if (env.paystack.mode === "test") warnings.push("PAYSTACK_SECRET_KEY is a TEST key while NODE_ENV=production: no real money will move.");
    if (!env.appUrl.startsWith("https://")) warnings.push("NEXT_PUBLIC_APP_URL is not https in production.");
    if (env.email.mode !== "live") warnings.push(`EMAIL_MODE is "${env.email.mode}" in production: customers will not receive e-mail.`);
  }
  return { ok: problems.length === 0, problems, warnings };
}

export function formatEnvReport(report: EnvReport): string {
  const lines = report.problems.map((p) => `  - ${p.feature}: ${p.missing.join(", ")}`);
  return [
    report.ok ? "Environment OK" : "Environment problems (names only, values are never printed):",
    ...lines,
    ...report.warnings.map((w) => `  ! ${w}`),
  ].join("\n");
}
