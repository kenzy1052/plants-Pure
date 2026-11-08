import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser(); // verified with the Auth server
  if (!auth.user) redirect("/auth/sign-in?next=/account");

  // Self-heals a missing profile row; returns the caller's own row only. `role`
  // is the authority here, but it is only shown — authorization is enforced server-side.
  const { data: profile } = await supabase.rpc("ensure_my_profile");
  const p = (Array.isArray(profile) ? profile[0] : profile) as { first_name: string | null; last_name: string | null; phone: string | null; delivery_address: string | null; delivery_area: string | null; role: string | null } | null;

  const displayName = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || null;

  return (
    <div className="container-page py-12 md:py-20">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="eyebrow text-text-muted">Account</p>
            <h1 className="mt-3 text-h2">My account</h1>
            <p className="mt-2 text-text-secondary">{displayName ? `${displayName} · ${auth.user.email}` : auth.user.email}</p>
          </div>
          <form action="/auth/sign-out" method="post">
            <Button type="submit" variant="secondary">Sign out</Button>
          </form>
        </header>

        <div className="mt-10 space-y-16">
          <section aria-labelledby="details-heading">
            <h2 id="details-heading" className="eyebrow mb-6 text-text-muted">Contact details</h2>
            <ProfileForm userId={auth.user.id} initial={{ first_name: p?.first_name ?? "", last_name: p?.last_name ?? "", phone: p?.phone ?? "", delivery_address: p?.delivery_address ?? "", delivery_area: p?.delivery_area ?? "" }} />
          </section>

          <section aria-labelledby="password-heading">
            <h2 id="password-heading" className="eyebrow mb-6 text-text-muted">Password</h2>
            <PasswordForm />
          </section>

          <section aria-labelledby="orders-heading">
            <h2 id="orders-heading" className="eyebrow mb-6 text-text-muted">Orders</h2>
            <p className="border-t border-border pt-6 text-small text-text-secondary">
              Your order history appears here once your first order is placed.{" "}
              <Link href="/shop" className="underline underline-offset-4">Continue shopping</Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

