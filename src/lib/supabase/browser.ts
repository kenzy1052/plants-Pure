import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";

let client: SupabaseClient | undefined;

/**
 * Browser Supabase client (anon key, the user's own session, subject to RLS).
 * Safe to import from client components. It can only do what the database
 * policies allow — see supabase/migrations.
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return (client ??= createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey));
}
