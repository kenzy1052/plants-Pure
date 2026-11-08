import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS, CONTACT, SITE_URL } from "../business";
import { formatGHS } from "../money";
import { trackingCode } from "../tracking";

/**
 * Resend transactional e-mail, ported from the original project (lib/email/*).
 * EMAIL_MODE: off | sandbox (all mail redirected to EMAIL_SANDBOX_RECIPIENT) | live (default).
 * Sender: RESEND_FROM_EMAIL (unchanged).
 */
export type SendResult =
  | { status: "sent"; messageId: string | null }
  | { status: "skipped"; reason: "mode_off" | "not_configured" | "sandbox_without_recipient" }
  | { status: "failed"; error: string };

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendEmail(input: { to: string; subject: string; html: string; text: string; idempotencyKey: string; replyTo?: string }): Promise<SendResult> {
  const mode = (process.env["EMAIL_MODE"] || "live").toLowerCase();
  if (mode === "off") return { status: "skipped", reason: "mode_off" };
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"];
  if (!apiKey || !from) return { status: "skipped", reason: "not_configured" };
  let to = input.to;
  let subject = input.subject;
  if (mode === "sandbox") {
    const r = process.env["EMAIL_SANDBOX_RECIPIENT"];
    if (!r) return { status: "skipped", reason: "sandbox_without_recipient" };
    to = r;
    subject = `[SANDBOX] ${subject}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({ from, to: [to], reply_to: input.replyTo ?? CONTACT.email, subject, html: input.html, text: input.text }),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => null)) as { id?: string; name?: string } | null;
    if (!res.ok) return { status: "failed", error: `resend_http_${res.status}${body?.name ? `_${body.name}` : ""}` };
    return { status: "sent", messageId: body?.id ?? null };
  } catch (err) {
    return { status: "failed", error: err instanceof Error && err.name === "AbortError" ? "resend_timeout" : "resend_network_error" };
  } finally {
    clearTimeout(timer);
  }
}

function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Inter,Arial,Helvetica,sans-serif;color:#2c2b2a">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:#ffffff;border-radius:20px;padding:32px;border:1px solid #ded9d5">
<p style="margin:0 0 24px;font-family:Georgia,serif;font-size:22px;color:#2e351a">Plants <span style="color:#ff6a14">&amp;</span> Pure</p>
${inner}
</div>
<p style="font-size:12px;color:#5b5753;margin:16px 8px 0;line-height:1.6">${esc(BUSINESS.legalName)} · ${esc(CONTACT.location)}<br>${esc(CONTACT.email)} · ${esc(CONTACT.phones[0].label)} · ${esc(CONTACT.hours)}</p>
</div></body></html>`;
}

const KIND = "order_confirmation";

/** Sends the order confirmation at most once per order (claim_email lock, unchanged). */
export async function sendOrderConfirmationIfNeeded(admin: SupabaseClient, orderId: string) {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, order_number, public_id, customer_name, customer_email, subtotal, delivery_fee, total_amount, payment_status, order_items(product_title, quantity, unit_price), delivery_zones(name, is_pickup)")
    .eq("id", orderId)
    .single();
  if (error || !order) throw error ?? new Error("order not found");
  if (order.payment_status !== "paid") return "skipped";
  if (!order.customer_email) return "no_recipient";

  const { data: claimed, error: claimError } = await admin.rpc("claim_email", { p_kind: KIND, p_order_id: orderId, p_recipient: order.customer_email });
  if (claimError) throw claimError;
  if (!claimed) return "already_handled";

  const { data: pay } = await admin.from("payments").select("reference").eq("order_id", orderId).eq("status", "success").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const zone = (Array.isArray(order.delivery_zones) ? order.delivery_zones[0] : order.delivery_zones) as { name: string; is_pickup: boolean } | null;
  const items = ((order.order_items ?? []) as { product_title: string; quantity: number; unit_price: number | string }[]).map((i) => ({ title: i.product_title, quantity: i.quantity, unitPrice: Number(i.unit_price) }));
  const appUrl = process.env["APP_URL"] || SITE_URL;
  void pay;
  const code = trackingCode(order.order_number as number, order.public_id as string);
  const trackUrl = `${appUrl}/track?code=${encodeURIComponent(code)}`;
  const isPickup = Boolean(zone?.is_pickup);
  const rows = items
    .map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f0ede9">${esc(i.quantity)} × ${esc(i.title)}</td><td style="padding:8px 0;border-bottom:1px solid #f0ede9;text-align:right">${esc(formatGHS(i.unitPrice * i.quantity))}</td></tr>`)
    .join("");
  const subject = `Payment received — order #${order.order_number} | ${BUSINESS.legalName}`;
  const html = shell(`<h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0 0 8px;color:#2c2b2a">Thank you, ${esc(order.customer_name)}</h1>
<p style="margin:0 0 16px;color:#43413f">We have received your payment for order <strong>#${esc(order.order_number)}</strong>.</p>
<p style="margin:0 0 20px;padding:14px 16px;background:#f4f4f4;border-radius:12px;font-size:14px;color:#43413f">Your tracking code<br><strong style="font-size:20px;letter-spacing:1px;color:#2c2b2a">${esc(code)}</strong></p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
<tr><td style="padding:8px 0">Subtotal</td><td style="padding:8px 0;text-align:right">${esc(formatGHS(Number(order.subtotal)))}</td></tr>
<tr><td style="padding:8px 0">${isPickup ? "Collection" : "Delivery"}</td><td style="padding:8px 0;text-align:right">${esc(formatGHS(Number(order.delivery_fee)))}</td></tr>
<tr><td style="padding:8px 0;font-weight:700">Total paid</td><td style="padding:8px 0;text-align:right;font-weight:700">${esc(formatGHS(Number(order.total_amount)))}</td></tr></table>
${zone ? `<p style="margin:16px 0 0;font-size:14px;color:#43413f">${isPickup ? "Collection" : "Delivery"}: ${esc(zone.name)}</p>` : ""}
<p style="margin:24px 0 0"><a href="${esc(trackUrl)}" style="display:inline-block;background:#2e351a;color:#edf1e3;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px">Track your order</a></p>`);
  const text = [
    `Thank you, ${order.customer_name}.`,
    `We have received your payment for order #${order.order_number}.`,
    "",
    ...items.map((i) => `${i.quantity} x ${i.title}  ${formatGHS(i.unitPrice * i.quantity)}`),
    `Subtotal: ${formatGHS(Number(order.subtotal))}`,
    `${isPickup ? "Collection" : "Delivery"}: ${formatGHS(Number(order.delivery_fee))}`,
    `Total paid: ${formatGHS(Number(order.total_amount))}`,
    "",
    `Tracking code: ${code}`,
    `Track your order: ${trackUrl}`,
  ].join("\n");

  const result = await sendEmail({ to: order.customer_email, subject, html, text, idempotencyKey: `${KIND}:${orderId}` });
  if (result.status === "sent") {
    await admin.rpc("finish_email", { p_kind: KIND, p_order_id: orderId, p_status: "sent", p_message_id: result.messageId, p_error: null });
    return "sent";
  }
  if (result.status === "skipped" && result.reason === "mode_off") {
    await admin.rpc("finish_email", { p_kind: KIND, p_order_id: orderId, p_status: "skipped", p_message_id: null, p_error: "mode_off" });
    return "skipped";
  }
  const reason = result.status === "skipped" ? result.reason : result.error;
  await admin.rpc("finish_email", { p_kind: KIND, p_order_id: orderId, p_status: "failed", p_message_id: null, p_error: reason });
  return "failed";
}

export function contactEmail(c: { name: string; email: string; phone?: string; subject: string; message: string }) {
  const subject = `Website message: ${c.subject}`;
  const phone = c.phone ? c.phone : "not provided";
  const text = [`New message from the ${BUSINESS.legalName} website`, "", `Name: ${c.name}`, `E-mail: ${c.email}`, `Phone: ${phone}`, `Subject: ${c.subject}`, "", c.message].join("\n");
  const html = shell(`<p style="margin:0 0 12px"><strong>New message from the website</strong></p>
<table style="font-size:14px;border-collapse:collapse">
<tr><td style="padding:3px 14px 3px 0;color:#5b5753">Name</td><td>${esc(c.name)}</td></tr>
<tr><td style="padding:3px 14px 3px 0;color:#5b5753">E-mail</td><td>${esc(c.email)}</td></tr>
<tr><td style="padding:3px 14px 3px 0;color:#5b5753">Phone</td><td>${esc(phone)}</td></tr>
<tr><td style="padding:3px 14px 3px 0;color:#5b5753">Subject</td><td>${esc(c.subject)}</td></tr></table>
<p style="white-space:pre-wrap;margin:18px 0 0;font-size:15px">${esc(c.message)}</p>
<p style="margin:20px 0 0;font-size:12px;color:#5b5753">Reply to this e-mail to answer the sender directly.</p>`);
  return { subject, html, text };
}
