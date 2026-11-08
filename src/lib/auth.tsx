import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

type AuthState = { user: User | null; session: Session | null; loading: boolean };
const AuthContext = createContext<AuthState>({ user: null, session: null, loading: true });

/** Existing Supabase Auth (same users, same sessions rules). One subscription for the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: true });
  useEffect(() => {
    const sb = getSupabase();
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, session, loading: false });
    });
    sb.auth.getSession().then(({ data: d }) => setState({ user: d.session?.user ?? null, session: d.session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Only same-site relative paths are allowed as post-sign-in destinations. */
export function safeNext(next: unknown, fallback = "/account"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
