import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return <AuthForm mode="sign-in" next={sp.next} initialError={sp.error === "link_invalid" ? "That link is invalid or has expired. Please try again." : null} />;
}
