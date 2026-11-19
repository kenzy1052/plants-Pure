import { BUSINESS, CONTACT, SITE_URL } from "../business";
import { parseTrackingCode, trackingCode } from "../tracking";
import { esc, sendEmail } from "./email.server";
import { getAdminClient, PublicError } from "./payments.server";

/**
 * Server-only logic for: e-mail subscriptions, unsubscribe links and post-delivery reviews.
 * Uses the same service-role Supabase client and the same Resend helper as checkout, so no new
 * keys or environment variables are needed.
 */

const appUrl = () => process.env["APP_URL"] || SITE_URL;

function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#faf7f5;font-family:Inter,Arial,Helvetica,sans-serif;color:#2d2d2d">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e8e8e8">
<div style="background:#b50606;height:6px"></div>
<div style="padding:32px">
<p style="margin:0 0 24px;font-family:Georgia,serif;font-size:22px;color:#b50606">plants <span style="color:#6fbf00">&amp;</span> pure</p>
${inner}
</div></div>
<p style="font-size:12px;color:#6b7280;margin:16px 8px 0;line-height:1.6">${esc(BUSINESS.legalName)} · ${esc(CONTACT.location)}<br>${esc(CONTACT.email)} · ${esc(CONTACT.phones[0].label)}</p>
</div></body></html>`;
}

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                               */
/* -------------------------------------------------------------------------- */

export async function subscribeEmail(input: { email: string; firstName?: string; source: string }): Promise<{ status: "subscribed" | "already" | "resubscribed" }> {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("subscribe_email", { p_email: input.email, p_first_name: input.firstName ?? null, p_source: input.source });
  if (error) {
    if ((error.message ?? "").includes("INVALID_EMAIL")) throw new PublicError("Please enter a valid email address.", "invalid_email");
    throw error;
  }
  const r = data as { status: "subscribed" | "already" | "resubscribed"; token: string };

  // Welcome e-mail only for brand-new or returning subscribers; never twice for the same person.
  if (r.status !== "already") {
    const unsub = `${appUrl()}/unsubscribe?token=${encodeURIComponent(r.token)}`;
    const hello = input.firstName ? `Welcome, ${esc(input.firstName)}` : "Welcome to the circle";
    const html = shell(`<h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:0 0 12px">${hello}</h1>
<p style="margin:0 0 14px;color:#43413f;line-height:1.6">Thank you for joining Plants &amp; Pure. You'll be among the first to hear about fresh batches, new products (our cereal range is on its way), kitchen tips and special offers.</p>
<p style="margin:0 0 22px;color:#43413f;line-height:1.6">We only write when we have something worth your time.</p>
<p style="margin:0 0 26px"><a href="${esc(appUrl())}/shop" style="display:inline-block;background:#b50606;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:600">Explore the range</a></p>
<p style="margin:0;font-size:12px;color:#6b7280">Changed your mind? <a href="${esc(unsub)}" style="color:#6b7280">Unsubscribe</a> at any time.</p>`);
    const text = [`${input.firstName ? `Welcome, ${input.firstName}` : "Welcome to the circle"}.`, "", "Thank you for joining Plants & Pure. You'll be among the first to hear about fresh batches, new products, kitchen tips and special offers.", "", `Shop: ${appUrl()}/shop`, `Unsubscribe: ${unsub}`].join("\n");
    try {
      const res = await sendEmail({ to: input.email, subject: "Welcome to Plants & Pure", html, text, idempotencyKey: `welcome:${r.token}` });
      if (res.status === "failed") console.error("subscribe.welcome_failed", res.error);
    } catch (err) {
      console.error("subscribe.welcome_failed", String(err));
    }
  }
  return { status: r.status };
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("unsubscribe_email", { p_token: token });
  if (error) throw error;
  return Boolean(data);
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                     */
/* -------------------------------------------------------------------------- */

type OrderRow = { id: string; order_number: number; public_id: string; customer_name: string; payment_status: string; fulfillment_status: string };

async function findOrderForReview(raw: string): Promise<OrderRow | null> {
  const parsed = parseTrackingCode(raw);
  if (!parsed) return null;
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, public_id, customer_name, payment_status, fulfillment_status")
    .eq("order_number", parsed.orderNumber)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as OrderRow;
  if (trackingCode(row.order_number, row.public_id) !== `PP-${parsed.orderNumber}-${parsed.prefix.toUpperCase()}`) return null;
  return row;
}

export async function getReviewState(code: string): Promise<{ eligible: boolean; reviewed: boolean } | null> {
  const order = await findOrderForReview(code);
  if (!order) return null;
  const eligible = order.payment_status === "paid" && order.fulfillment_status === "delivered";
  const { data, error } = await getAdminClient().from("reviews").select("id").eq("order_id", order.id).maybeSingle();
  if (error) throw error;
  return { eligible, reviewed: Boolean(data) };
}

/** "Ama Mensah" → "Ama M."  (we never publish a full name). */
function displayName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Verified customer";
  const first = parts[0]!.slice(0, 24);
  const last = parts.length > 1 ? ` ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.` : "";
  return `${first}${last}`;
}

export async function submitReview(input: { code: string; rating: number; title?: string; body: string }): Promise<void> {
  const order = await findOrderForReview(input.code);
  if (!order) throw new PublicError("We couldn't find that order.", "not_found");
  if (order.payment_status !== "paid" || order.fulfillment_status !== "delivered") {
    throw new PublicError("You can review an order once it has been delivered or collected.", "not_delivered");
  }
  const admin = getAdminClient();
  const name = displayName(order.customer_name);
  const { error } = await admin.from("reviews").insert({
    order_id: order.id,
    display_name: name,
    rating: input.rating,
    title: input.title?.trim() || null,
    body: input.body.trim(),
  });
  if (error) {
    if (error.code === "23505") throw new PublicError("You've already reviewed this order. Thank you!", "already_reviewed");
    throw error;
  }

  // Tell the team there is something to approve (best effort — never blocks the customer).
  try {
    const link = `${appUrl()}/admin?tab=reviews`;
    const stars = "★".repeat(input.rating) + "☆".repeat(5 - input.rating);
    await sendEmail({
      to: CONTACT.email,
      subject: `New ${input.rating}-star review awaiting approval`,
      html: shell(`<p style="margin:0 0 12px"><strong>${esc(name)}</strong> left a review for order #${esc(order.order_number)}</p>
<p style="margin:0 0 8px;font-size:20px;color:#b50606;letter-spacing:2px">${stars}</p>
${input.title ? `<p style="margin:0 0 6px;font-weight:600">${esc(input.title)}</p>` : ""}
<p style="white-space:pre-wrap;margin:0 0 22px;color:#43413f">${esc(input.body)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#b50606;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:600">Review &amp; approve</a>`),
      text: `${name} left a ${input.rating}-star review for order #${order.order_number}:\n\n${input.title ? input.title + "\n" : ""}${input.body}\n\nApprove it here: ${link}`,
      idempotencyKey: `review-admin:${order.id}`,
    });
  } catch (err) {
    console.error("review.admin_notify_failed", String(err));
  }
}
