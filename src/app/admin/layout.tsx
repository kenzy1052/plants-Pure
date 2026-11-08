import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Catalogue admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Server-side gate for everything under /admin. The role comes from public.profiles (never
 * from user metadata). Anonymous visitors are sent to sign in; signed-in non-admins get a
 * plain 404 so the area's existence is not advertised. Every admin API and database function
 * re-checks the role independently: this gate is for the pages, not the data.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth/sign-in?next=/admin/products");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "admin") notFound();

  const link = "inline-flex h-11 items-center px-1 text-small font-semibold underline-offset-8 hover:underline";
  return (
    <div className="container-page py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="eyebrow text-text-muted">Admin</p>
          <p className="mt-1 font-display text-h3">Catalogue</p>
        </div>
        <nav aria-label="Admin sections" className="flex gap-6">
          <Link href="/admin/products" className={link}>Products</Link>
          <Link href="/admin/categories" className={link}>Categories</Link>
        </nav>
      </header>
      <div className="pt-8">{children}</div>
    </div>
  );
}
