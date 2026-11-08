import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config";

/** Client side: attach the signed-in customer's access token to server function calls. */
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  if (typeof window === "undefined") return next();
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

/**
 * Server side: verifies the bearer token with Supabase Auth. Guests are allowed (userId = null);
 * the user id is never taken from the request body.
 */
export const optionalSupabaseUser = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const header = getRequestHeader("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  let userId: string | null = null;
  if (token) {
    const sb = createClient(process.env["SUPABASE_URL"] || SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await sb.auth.getUser(token);
    userId = data.user?.id ?? null;
  }
  return next({ context: { userId } });
});
