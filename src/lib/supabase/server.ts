import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireFeature } from "@/lib/env/server";

/**
 * Per-request Supabase client for Server Components, Route Handlers and Server
 * Actions. Acts as the signed-in user (cookie session) and is subject to RLS.
 * Create a NEW client for every request — never cache it at module level.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const env = requireFeature("supabase");
  const cookieStore = await cookies();

  return createServerClient(env.supabase.url!, env.supabase.anonKey!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe to
          // ignore: src/proxy.ts refreshes the session on the way in.
        }
      },
    },
  });
}
