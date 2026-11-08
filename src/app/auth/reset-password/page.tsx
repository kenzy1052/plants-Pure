import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "New password", robots: { index: false, follow: false } };

export default function Page() {
  return <AuthForm mode="reset" />;
}
