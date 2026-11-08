"use client";

import { useRef, useState } from "react";
import { contactSchema } from "@/lib/contact";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";

type Errors = Partial<Record<"name" | "email" | "phone" | "subject" | "message", string>>;
const FIELDS = ["name", "email", "phone", "subject", "message"] as const;

type ApiFailure = { ok: false; error?: { code?: string; message?: string; details?: Record<string, string[]> } };

/**
 * Sends the message through POST /api/contact (a real e-mail via Resend). It only says "sent" when the
 * server confirms the e-mail provider accepted it; otherwise it shows the server's honest message.
 * The same zod schema validates here and on the server. One request id per message: pressing Send twice
 * cannot deliver two e-mails.
 */
export function ContactForm() {
  const [values, setValues] = useState({ name: "", email: "", phone: "", subject: "", message: "", website: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const requestId = useRef<string>("");
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setFormError(null);
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const payload = { ...values, clientRequestId: requestId.current };

    const parsed = contactSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof Errors;
        if ((FIELDS as readonly string[]).includes(k) && !next[k]) next[k] = issue.message;
      }
      setErrors(next);
      document.getElementById(`contact-${FIELDS.find((f) => next[f]) ?? "name"}`)?.focus();
      return;
    }
    setErrors({});
    setState("sending");
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = (await res.json().catch(() => null)) as ({ ok: true } | ApiFailure) | null;
      if (res.ok && json && json.ok) {
        setState("sent");
        return;
      }
      const failure = json && json.ok === false ? json.error : undefined;
      if (failure?.code === "validation_failed" && failure.details) {
        const next: Errors = {};
        for (const f of FIELDS) if (failure.details[f]?.[0]) next[f] = failure.details[f]![0];
        setErrors(next);
      }
      setFormError(failure?.message ?? "We couldn’t send your message. Please try again.");
    } catch {
      setFormError("We couldn’t reach the server. Check your connection and try again.");
    }
    setState("idle");
  }

  if (state === "sent") {
    return (
      <div role="status" className="border-y border-border py-10">
        <p className="eyebrow text-success">Message sent</p>
        <h2 className="mt-3 text-h3">Thank you, {values.name.split(" ")[0]}.</h2>
        <p className="mt-3 max-w-prose text-text-secondary">We have received your message and will reply to {values.email}.</p>
        <Button
          className="mt-6"
          variant="secondary"
          onClick={() => {
            requestId.current = ""; // the next message is a new message
            setValues({ name: "", email: "", phone: "", subject: "", message: "", website: "" });
            setState("idle");
          }}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Send us a message" className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="contact-name" label="Name" required error={errors.name}>
          {(a) => <Input {...a} name="name" autoComplete="name" value={values.name} onChange={set("name")} maxLength={120} />}
        </Field>
        <Field id="contact-email" label="E-mail" required error={errors.email}>
          {(a) => <Input {...a} name="email" type="email" autoComplete="email" value={values.email} onChange={set("email")} maxLength={254} />}
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="contact-phone" label="Phone (optional)" error={errors.phone}>
          {(a) => <Input {...a} name="phone" type="tel" autoComplete="tel" inputMode="tel" value={values.phone} onChange={set("phone")} maxLength={32} />}
        </Field>
        <Field id="contact-subject" label="Subject" required error={errors.subject}>
          {(a) => <Input {...a} name="subject" value={values.subject} onChange={set("subject")} maxLength={150} />}
        </Field>
      </div>
      <Field id="contact-message" label="Message" required error={errors.message}>
        {(a) => <Textarea {...a} name="message" rows={6} value={values.message} onChange={set("message")} maxLength={2000} />}
      </Field>

      {/* Honeypot: hidden from people and assistive technology; bots that fill it are ignored. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
        </label>
      </div>

      {formError && (
        <p role="alert" className="border-l-2 border-danger pl-3 text-small font-medium text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" loading={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
