import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireFeature } from "@/lib/env/server";

let admin: SupabaseClient | undefined;

/**
 * Service-role client: BYPASSES Row Level Security. Server code only.
 *
 * Use it for the privileged operations the brief reserves for the backend —
 * creating orders, verifying payments, signing uploads, admin mutations — and
 * ONLY after the caller has been authenticated and authorised (requireUser /
 * requireRole in src/lib/api/auth.ts) or the request has been cryptographically
 * verified (Paystack webhook signature).
 *
 * `import "server-only"` makes the build fail if a client component imports this.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const env = requireFeature("supabaseAdmin");
  admin = createClient(env.supabase.url!, env.supabase.serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}

/** test helper */
export function __setSupabaseAdminForTests(client: SupabaseClient | undefined) {
  admin = client;
}
