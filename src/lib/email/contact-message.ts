import { COMPANY_NAME } from "@/lib/constants/business";
import { esc } from "@/lib/email/templates";
import type { ContactInput } from "@/lib/contact";

/** The e-mail the business receives. Everything from the visitor is escaped before it enters HTML. */
export function contactEmail(c: Pick<ContactInput, "name" | "email" | "phone" | "subject" | "message">) {
  const subject = `Website message: ${c.subject}`;
  const phone = c.phone ? c.phone : "not provided";
  const text = [`New message from the ${COMPANY_NAME} website`, "", `Name: ${c.name}`, `E-mail: ${c.email}`, `Phone: ${phone}`, `Subject: ${c.subject}`, "", c.message].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<p style="margin:0 0 12px"><strong>New message from the ${esc(COMPANY_NAME)} website</strong></p>
<table style="font-size:14px;border-collapse:collapse">
<tr><td style="padding:2px 12px 2px 0;color:#57534e">Name</td><td>${esc(c.name)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#57534e">E-mail</td><td>${esc(c.email)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#57534e">Phone</td><td>${esc(phone)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#57534e">Subject</td><td>${esc(c.subject)}</td></tr></table>
<p style="white-space:pre-wrap;margin:16px 0 0;font-size:15px">${esc(c.message)}</p>
<p style="margin:20px 0 0;font-size:12px;color:#57534e">Reply to this e-mail to answer the sender directly.</p>
</body></html>`;
  return { subject, html, text };
}
