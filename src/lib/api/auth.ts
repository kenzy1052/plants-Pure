import "server-only";
import { Errors } from "@/lib/api/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "customer" | "admin" | "dispatch";
export type SessionUser = { id: string; email: string | null };

/**
 * The signed-in user, verified with the Supabase Auth server (getUser) — never
 * decoded from the cookie alone, and never read from client-supplied fields.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw Errors.unauthorized();
  return user;
}

/**
 * The user's role from public.profiles — the only authority. user_metadata is
 * editable by the user themselves and must never be used for authorisation.
 */
export async function requireRole(allowed: AppRole[]): Promise<SessionUser & { role: AppRole }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) throw Errors.upstream();
  const role = (data?.role ?? null) as AppRole | null;
  if (!role || !allowed.includes(role)) throw Errors.forbidden();
  return { ...user, role };
}
