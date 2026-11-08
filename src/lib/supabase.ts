import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config";

/**
 * Browser client for the existing Supabase project (auth session in localStorage, RLS applies).
 * On the server (SSR / loaders) a session-less anonymous client is used instead, so public
 * catalogue reads are identical for everyone.
 */
let browserClient: SupabaseClient | undefined;
let anonClient: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (typeof window === "undefined") return getAnonSupabase();
  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return browserClient;
}

/** Session-less client: public catalogue reads only. */
export function getAnonSupabase(): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "pp-public-reads" },
    });
  }
  return anonClient;
}
