import { queryOptions } from "@tanstack/react-query";
import { getSupabase } from "./supabase";

export type Role = "customer" | "admin" | "dispatch";
export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  delivery_address: string | null;
  delivery_area: string | null;
  role: Role;
};

/** The signed-in user's profile (created on first call). The `role` column is what unlocks /admin. */
export const myProfileQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["my-profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await getSupabase().rpc("ensure_my_profile");
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as Profile | null;
    },
  });

export const isStaffRole = (r: Role | undefined | null) => r === "admin" || r === "dispatch";

/** Where to land after signing in: a requested page, otherwise the user's own dashboard. */
export async function landingFor(next: string | undefined, safe: (n: unknown, f?: string) => string): Promise<string> {
  if (next) return safe(next);
  try {
    const { data } = await getSupabase().rpc("ensure_my_profile");
    const p = (Array.isArray(data) ? data[0] : data) as Profile | null;
    return isStaffRole(p?.role) ? "/admin" : "/account";
  } catch {
    return "/account";
  }
}
