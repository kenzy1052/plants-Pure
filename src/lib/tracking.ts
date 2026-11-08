/**
 * Customer-facing order tracking code, derived from the order number and the order's unguessable
 * public_id (uuid). Example: PP-12-9F3A2C1B. The server re-derives and compares it, so a code can't
 * be guessed from an order number alone.
 */
export function trackingCode(orderNumber: number, publicId: string): string {
  return `PP-${orderNumber}-${publicId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export const TRACKING_RE = /^PP-(\d{1,10})-([0-9A-F]{8})$/;

export function parseTrackingCode(raw: string): { orderNumber: number; prefix: string } | null {
  const m = TRACKING_RE.exec(raw.trim().toUpperCase().replace(/\s+/g, ""));
  if (!m) return null;
  return { orderNumber: Number(m[1]), prefix: m[2]!.toLowerCase() };
}

export const FULFILMENT_STEPS = [
  { key: "unfulfilled", label: "Order received" },
  { key: "processing", label: "Being packed" },
  { key: "dispatched", label: "On its way" },
  { key: "delivered", label: "Delivered" },
] as const;

/** Step names shown to customers and staff. Collection orders use the "ready to collect" wording. */
export function stepLabels(isPickup: boolean): string[] {
  return ["Order received", "Being packed", isPickup ? "Ready to collect" : "On its way", isPickup ? "Collected" : "Delivered"];
}

/** Fulfilment statuses staff can set, in order (cancelled is handled separately). */
export const STAFF_STATUS_KEYS = ["unfulfilled", "processing", "dispatched", "delivered", "on_hold"] as const;

export function statusLabel(key: string, isPickup: boolean): string {
  const i = FULFILMENT_STEPS.findIndex((s) => s.key === key);
  if (i >= 0) return stepLabels(isPickup)[i]!;
  if (key === "on_hold") return "On hold";
  if (key === "cancelled") return "Cancelled";
  return key.replace(/_/g, " ");
}
