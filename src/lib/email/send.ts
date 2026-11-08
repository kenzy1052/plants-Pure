import "server-only";
import { getServerEnv, missingFor } from "@/lib/env/server";
import { logger } from "@/lib/api/logger";
import { CONTACT } from "@/lib/constants/business";

export type SendResult =
  | { status: "sent"; messageId: string | null }
  | { status: "skipped"; reason: "mode_off" | "not_configured" | "sandbox_without_recipient" }
  | { status: "failed"; error: string; retryable: boolean };

let fetchImpl: typeof fetch = (...a) => fetch(...a);
export function __setEmailFetchForTests(f: typeof fetch | undefined) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

/**
 * Sends one transactional e-mail through Resend's REST API.
 *
 * Safe-by-default modes (EMAIL_MODE):
 *  - off      : nothing is sent.
 *  - sandbox  : (default outside production) EVERY message is redirected to
 *               EMAIL_SANDBOX_RECIPIENT, subject-tagged. Real customers are never
 *               e-mailed from a development machine. No recipient → skipped.
 *  - live     : (default in production) sent to the real recipient.
 *
 * `idempotencyKey` is forwarded as Resend's Idempotency-Key so a retry after a
 * timeout cannot send twice.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  /** Where replies go. Defaults to the business address. */
  replyTo?: string;
}): Promise<SendResult> {
  const env = getServerEnv();
  if (env.email.mode === "off") return { status: "skipped", reason: "mode_off" };
  if (missingFor("resend", env).length) return { status: "skipped", reason: "not_configured" };

  let to = input.to;
  let subject = input.subject;
  if (env.email.mode === "sandbox") {
    if (!env.email.sandboxRecipient) return { status: "skipped", reason: "sandbox_without_recipient" };
    to = env.email.sandboxRecipient;
    subject = `[SANDBOX] ${subject}`;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resend.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({ from: env.resend.fromEmail, to: [to], reply_to: input.replyTo ?? CONTACT.email, subject, html: input.html, text: input.text }),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (!res.ok) {
      logger.warn("email.resend_error", { httpStatus: res.status, name: body?.name });
      return { status: "failed", error: `resend_http_${res.status}${body?.name ? `_${body.name}` : ""}`, retryable: res.status >= 500 || res.status === 429 };
    }
    return { status: "sent", messageId: body?.id ?? null };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { status: "failed", error: aborted ? "resend_timeout" : "resend_network_error", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}
