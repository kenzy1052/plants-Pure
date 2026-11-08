import crypto from "node:crypto";
import { getServerEnv, missingFor, FEATURES } from "@/lib/env/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { route } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

function tokenMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Public: liveness + database reachability only ("ok" / "degraded"). Safe for
 * uptime monitors. With `Authorization: Bearer <HEALTH_CHECK_TOKEN>` it also
 * reports which integrations are configured (names + true/false, never values).
 */
export const GET = route("health", async (req: Request) => {
  enforceRateLimit(req, "health", { max: 120, windowMs: 60_000 });
  const env = getServerEnv();
  const started = Date.now();

  let database: "ok" | "error" | "not_configured" = "not_configured";
  if (!missingFor("supabaseAdmin", env).length) {
    try {
      const { error } = await getSupabaseAdmin().from("categories").select("id").limit(1);
      database = error ? "error" : "ok";
    } catch {
      database = "error";
    }
  }
  const status = database === "ok" ? "ok" : "degraded";

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const detailed = tokenMatches(bearer, env.healthCheckToken);

  const body = {
    status,
    time: new Date().toISOString(),
    ...(detailed
      ? {
          latencyMs: Date.now() - started,
          database,
          integrations: Object.fromEntries(FEATURES.map((f) => [f, missingFor(f, env).length === 0])),
          paystackMode: env.paystack.mode ?? null,
          emailMode: env.email.mode,
        }
      : {}),
  };
  return Response.json(body, { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
});
