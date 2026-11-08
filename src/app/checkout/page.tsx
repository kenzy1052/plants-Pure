import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckoutClient, type CheckoutZone } from "./checkout-client";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Delivery options come from the database (the business owns them), never from code. */
export default async function CheckoutPage() {
  let zones: CheckoutZone[] = [];
  let loadFailed = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("delivery_zones")
      .select("id, name, fee, free_over, is_pickup")
      .eq("is_active", true)
      .order("display_order")
      .order("name");
    if (error) throw error;
    zones = (data ?? []).map((z) => ({ id: z.id, name: z.name, fee: Number(z.fee), freeOver: z.free_over === null ? null : Number(z.free_over), isPickup: z.is_pickup }));
  } catch {
    loadFailed = true;
  }
  return <CheckoutClient zones={zones} loadFailed={loadFailed} />;
}
