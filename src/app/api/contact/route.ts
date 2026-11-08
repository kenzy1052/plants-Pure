import { ok, route, Errors } from "@/lib/api/errors";
import { assertSameOrigin, readJson } from "@/lib/api/request";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { logger } from "@/lib/api/logger";
import { sendEmail } from "@/lib/email/send";
import { contactSchema } from "@/lib/contact";
import { contactEmail } from "@/lib/email/contact-message";
import { CONTACT } from "@/lib/constants/business";

export const dynamic = "force-dynamic";

/**
 * Contact form -> e-mail to the business (Resend).
 *  - same-origin only; JSON only; body size limited; validated with the SAME schema as the form;
 *  - rate limited per client (in-memory: see rate-limit.ts for its honest limits);
 *  - honeypot field: bots that fill it get a normal-looking answer but nothing is sent;
 *  - the Resend idempotency key is derived from the form's own request id, so a double click
 *    or a retry after a timeout cannot send two e-mails;
 *  - the result is TRUTHFUL: success only when the e-mail provider accepted the message. If e-mail
 *    is switched off or not configured the visitor is told to e-mail or phone instead;
 *  - message content and addresses are never written to logs.
 */
export const POST = route("contact", async (req: Request) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "contact", { max: 5, windowMs: 10 * 60_000 });
  const input = await readJson(req, contactSchema, 8 * 1024);

  if (input.website && input.website.trim() !== "") {
    logger.info("contact.honeypot_triggered", {});
    return ok({ sent: true });
  }

  const mail = contactEmail(input);
  const result = await sendEmail({
    to: CONTACT.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    idempotencyKey: `contact-${input.clientRequestId}`,
    replyTo: input.email,
  });

  if (result.status === "sent") {
    logger.info("contact.sent", { messageId: result.messageId });
    return ok({ sent: true });
  }
  if (result.status === "skipped") {
    logger.warn("contact.not_sent", { reason: result.reason });
    throw Errors.unavailable(`Messages can’t be sent online right now. Please e-mail ${CONTACT.email} or call ${CONTACT.primaryPhone}.`);
  }
  logger.error("contact.send_failed", { error: result.error, retryable: result.retryable });
  throw Errors.upstream(`We couldn’t send your message. Please try again, or e-mail ${CONTACT.email} or call ${CONTACT.primaryPhone}.`);
});
