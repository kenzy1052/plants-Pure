import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Clock, Loader2, Mail, MapPin, Phone } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { authInput, FormMessage } from "@/components/site/AuthShell";
import { CONTACT } from "@/lib/business";
import { sendContactMessage } from "@/lib/checkout.functions";
import { contactSchema } from "@/lib/schemas";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Plants & Pure | Accra, Ghana" },
      { name: "description", content: "Questions about our spices, herbs or oils, or an order? Contact Plants & Pure in Accra by phone, email or message." },
      { property: "og:title", content: "Contact — Plants & Pure" },
      { property: "og:description", content: "Talk to Plants & Pure in Accra, Ghana." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://www.plantsandpure.com/contact" }],
  }),
  component: Contact,
});

function Contact() {
  const send = useServerFn(sendContactMessage);
  const [f, setF] = useState({ name: "", email: "", phone: "", subject: "", message: "", website: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const reqId = useRef<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!reqId.current) reqId.current = crypto.randomUUID();
    const parsed = contactSchema.safeParse({ ...f, clientRequestId: reqId.current });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (next[String(i.path[0])] ??= i.message));
      setErrors(next);
      return;
    }
    setErrors({});
    setState("sending");
    try {
      const res = await send({ data: parsed.data });
      if (res.ok) {
        setState("sent");
        return;
      }
      setServerError(res.error);
    } catch {
      setServerError(`We couldn't send your message. Please email ${CONTACT.email}.`);
    }
    setState("idle");
  };

  const details = [
    { icon: MapPin, label: "Location", value: CONTACT.location },
    { icon: Clock, label: "Hours", value: CONTACT.hours },
    { icon: Mail, label: "Email", value: CONTACT.email, href: `mailto:${CONTACT.email}` },
    ...CONTACT.phones.map((p) => ({ icon: Phone, label: "Phone", value: p.label, href: `tel:${p.tel}` })),
  ];

  return (
    <div className="container-page pb-24 pt-32 sm:pt-40">
      <div className="grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Reveal>
            <p className="type-label text-muted-foreground">Contact</p>
            <h1 className="type-page mt-4">Let's talk.</h1>
            <p className="type-lead mt-5 text-muted-foreground">Questions about a product or an order? We're happy to help.</p>
          </Reveal>
          <ul className="mt-10">
            {details.map((d, i) => (
              <Reveal as="li" key={i} delay={i * 70} className="flex items-center gap-4 border-t border-border py-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage text-forest"><d.icon className="h-4 w-4" /></span>
                <div>
                  <p className="type-label text-muted-foreground">{d.label}</p>
                  {d.href ? <a href={d.href} className="type-body link-line">{d.value}</a> : <p className="type-body">{d.value}</p>}
                </div>
              </Reveal>
            ))}
          </ul>
        </div>

        <Reveal className="lg:col-span-7" delay={120}>
          <div className="rounded-[2rem] bg-surface p-6 sm:p-10">
            {state === "sent" ? (
              <div className="py-10 text-center">
                <h2 className="type-section">Thank you!</h2>
                <p className="type-body mt-3 text-muted-foreground">Your message is on its way. We'll reply to {f.email} as soon as we can.</p>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
                <h2 className="type-sub sm:col-span-2">Send a message</h2>
                <Field label="Name" error={errors.name}><input className={authInput} value={f.name} onChange={set("name")} autoComplete="name" /></Field>
                <Field label="Email" error={errors.email}><input className={authInput} type="email" value={f.email} onChange={set("email")} autoComplete="email" /></Field>
                <Field label="Phone (optional)" error={errors.phone}><input className={authInput} type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></Field>
                <Field label="Subject" error={errors.subject}><input className={authInput} value={f.subject} onChange={set("subject")} /></Field>
                <div className="sm:col-span-2">
                  <Field label="Message" error={errors.message}><textarea className={`${authInput} h-40 py-3`} value={f.message} onChange={set("message")} maxLength={2000} /></Field>
                </div>
                <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} className="hidden" aria-hidden />
                {serverError && <div className="sm:col-span-2"><FormMessage tone="error">{serverError}</FormMessage></div>}
                <div className="sm:col-span-2">
                  <Button type="submit" variant="pepper" size="lg" disabled={state === "sending"}>
                    {state === "sending" && <Loader2 className="animate-spin" />} Send message
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="type-label text-muted-foreground">{label}</span>
      <div className="mt-2">{children}</div>
      {error && <span className="type-small mt-1.5 block text-destructive">{error}</span>}
    </label>
  );
}
