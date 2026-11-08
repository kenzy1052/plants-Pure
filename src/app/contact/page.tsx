import type { Metadata } from "next";
import { BUSINESS, CONTACT } from "@/lib/constants/business";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Plants & Pure in Accra, Ghana by e-mail, phone or message.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const link = "underline underline-offset-4 decoration-border-strong hover:decoration-text";
  const phones = BUSINESS.contact.phones;
  return (
    <div className="container-page pb-24">
      <header className="border-b border-border pb-8 pt-10 md:pt-14">
        <p className="eyebrow text-text-muted">Contact</p>
        <h1 className="mt-3 text-h1">Get in touch</h1>
        <p className="mt-4 max-w-prose text-lead text-text-secondary">Questions about our spices, herbs or oils, or about an order? We’re here to help.</p>
      </header>

      <div className="mt-12 grid gap-16 lg:grid-cols-12 lg:gap-8">
        <section aria-labelledby="details-heading" className="lg:col-span-5">
          <h2 id="details-heading" className="eyebrow text-text-muted">Our details</h2>
          <dl className="mt-6 divide-y divide-border border-y border-border">
            <div className="py-5">
              <dt className="eyebrow text-text-muted">E-mail</dt>
              <dd className="mt-1 text-lead"><a className={link} href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></dd>
            </div>
            <div className="py-5">
              <dt className="eyebrow text-text-muted">Phone</dt>
              <dd className="mt-1 space-y-1 text-lead">
                {phones.map((p) => (
                  <p key={p.tel}><a className={`${link} numeral`} href={`tel:${p.tel}`}>{p.value}</a></p>
                ))}
              </dd>
            </div>
            <div className="py-5">
              <dt className="eyebrow text-text-muted">Opening hours</dt>
              <dd className="mt-1 text-lead">{CONTACT.hours}</dd>
            </div>
            <div className="py-5">
              <dt className="eyebrow text-text-muted">Location</dt>
              <dd className="mt-1 text-lead">{CONTACT.location}</dd>
            </div>
            <div className="py-5">
              <dt className="eyebrow text-text-muted">Social</dt>
              <dd className="mt-1 flex flex-wrap gap-x-6 gap-y-2 text-lead">
                <a className={link} href={CONTACT.instagram} target="_blank" rel="noopener noreferrer">Instagram<span className="sr-only"> (opens in a new tab)</span></a>
                <a className={link} href={CONTACT.facebook} target="_blank" rel="noopener noreferrer">Facebook<span className="sr-only"> (opens in a new tab)</span></a>
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="form-heading" className="relative lg:col-span-6 lg:col-start-7">
          <h2 id="form-heading" className="eyebrow mb-6 text-text-muted">Send us a message</h2>
          <ContactForm />
        </section>
      </div>
    </div>
  );
}
