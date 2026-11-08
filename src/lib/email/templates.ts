import { CONTACT, COMPANY_NAME } from "@/lib/constants/business";
import { formatGHS } from "@/lib/money";

/** Escape anything that came from a customer or the database before it enters HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type OrderEmailData = {
  orderNumber: number;
  customerName: string;
  items: { title: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  zoneName: string | null;
  isPickup: boolean;
  trackUrl: string;
};

/**
 * Order confirmation. Wording is deliberately neutral: it states only what the
 * system knows (payment received, order recorded). It does not promise delivery
 * dates or make product claims, because those are not business-approved yet.
 */
export function orderConfirmationEmail(d: OrderEmailData): { subject: string; html: string; text: string } {
  const subject = `Payment received — order #${d.orderNumber} | ${COMPANY_NAME}`;
  const rows = d.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${esc(i.quantity)} × ${esc(i.title)}</td><td style="padding:6px 0;text-align:right">${esc(formatGHS(i.unitPrice * i.quantity))}</td></tr>`,
    )
    .join("");
  const where = d.isPickup ? "Collection from the business" : d.zoneName ? `Delivery: ${esc(d.zoneName)}` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff">
<h1 style="font-size:20px;margin:0 0 12px">Thank you, ${esc(d.customerName)}</h1>
<p style="margin:0 0 16px">We have received your payment for order <strong>#${esc(d.orderNumber)}</strong>.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
<tr><td style="padding:6px 0;border-top:1px solid #ddd">Subtotal</td><td style="padding:6px 0;border-top:1px solid #ddd;text-align:right">${esc(formatGHS(d.subtotal))}</td></tr>
<tr><td style="padding:6px 0">${d.isPickup ? "Collection" : "Delivery"}</td><td style="padding:6px 0;text-align:right">${esc(formatGHS(d.deliveryFee))}</td></tr>
<tr><td style="padding:6px 0;font-weight:bold">Total paid</td><td style="padding:6px 0;text-align:right;font-weight:bold">${esc(formatGHS(d.total))}</td></tr></table>
${where ? `<p style="margin:16px 0 0;font-size:14px">${where}</p>` : ""}
<p style="margin:16px 0"><a href="${esc(d.trackUrl)}" style="color:#1c1917">View your order</a></p>
<hr style="border:0;border-top:1px solid #ddd;margin:20px 0">
<p style="font-size:12px;color:#57534e;margin:0">${esc(COMPANY_NAME)} · ${esc(CONTACT.location)}<br>${esc(CONTACT.email)} · ${esc(CONTACT.primaryPhone)}<br>${esc(CONTACT.hours)}</p>
</div></body></html>`;
  const text = [
    `Thank you, ${d.customerName}.`,
    `We have received your payment for order #${d.orderNumber}.`,
    "",
    ...d.items.map((i) => `${i.quantity} x ${i.title}  ${formatGHS(i.unitPrice * i.quantity)}`),
    `Subtotal: ${formatGHS(d.subtotal)}`,
    `${d.isPickup ? "Collection" : "Delivery"}: ${formatGHS(d.deliveryFee)}`,
    `Total paid: ${formatGHS(d.total)}`,
    "",
    `View your order: ${d.trackUrl}`,
    "",
    `${COMPANY_NAME}, ${CONTACT.location}`,
    `${CONTACT.email} | ${CONTACT.primaryPhone} | ${CONTACT.hours}`,
  ].join("\n");
  return { subject, html, text };
}
