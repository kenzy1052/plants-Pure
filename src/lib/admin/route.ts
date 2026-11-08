import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { route, Errors } from "@/lib/api/errors";
import { assertSameOrigin } from "@/lib/api/request";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { requireRole, type SessionUser } from "@/lib/api/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { idParam } from "@/lib/admin/schemas";

type Ctx = { user: SessionUser; db: SupabaseClient; params: Record<string, string> };

/**
 * Wrapper for every product-management endpoint. In this order:
 *   1. same-origin check (CSRF second layer),
 *   2. coarse per-IP rate limit (before any database work),
 *   3. the caller must be signed in AND have role = admin in public.profiles,
 *   4. path ids must be UUIDs,
 *   5. the handler gets a Supabase client that acts AS THE SIGNED-IN ADMIN (not the
 *      service role), so the database re-checks is_admin() and the audit log records
 *      the real person.
 */
export function adminRoute(
  name: string,
  handler: (req: Request, ctx: Ctx) => Promise<Response>,
  opts: { max?: number } = {},
) {
  return route(name, async (req: Request, routeCtx?: { params?: Promise<Record<string, string>> }) => {
    assertSameOrigin(req);
    enforceRateLimit(req, name, { max: opts.max ?? 120, windowMs: 60_000 });
    const user = await requireRole(["admin"]);
    enforceRateLimit(req, `${name}.user`, { max: (opts.max ?? 120) * 5, windowMs: 60 * 60_000 }, user.id);
    const params = (await routeCtx?.params) ?? {};
    for (const v of Object.values(params)) {
      if (!idParam.safeParse(v).success) throw Errors.notFound();
    }
    const db = await createSupabaseServerClient();
    return handler(req, { user, db, params });
  });
}
