import Link from "next/link";
import { BUSINESS, COMPANY_NAME, CONTACT } from "@/lib/constants/business";
import { Wordmark } from "@/components/ui/Wordmark";

/**
 * Footer: the single dark "clove" ground of the site. Content comes only from
 * src/lib/constants/business.ts (each fact marked verified/unverified). Policy
 * links (delivery, returns, privacy, terms) are NOT shown yet because those pages
 * need business-approved text — see docs/DECISIONS.md.
 */
export default function Footer() {
  const link = "inline-flex min-h-8 items-center underline-offset-4 hover:underline";
  return (
    <footer data-surface="inverse" className="bg-inverse text-text-inverse">
      <div className="container-page section-space-sm grid gap-12 md:grid-cols-12">
        <div className="md:col-span-6">
          <Wordmark className="text-[2.5rem] text-text-inverse [&_em]:text-accent" />
          <p className="mt-5 max-w-md text-text-inverse-muted">
            {BUSINESS.descriptor.value} Founded in {BUSINESS.foundedYear.value}, based in {CONTACT.location}.
          </p>
        </div>

        <nav aria-label="Footer" className="md:col-span-2">
          <p className="eyebrow text-text-inverse-muted">Explore</p>
          <ul className="mt-4 space-y-1">
            {[
              ["/shop", "All products"],
              ["/about", "About us"],
              ["/contact", "Contact"],
              ["/account", "Account"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className={link}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="md:col-span-4">
          <p className="eyebrow text-text-inverse-muted">Contact</p>
          <address className="mt-4 space-y-1 not-italic">
            <p>
              <a className={link} href={`tel:${CONTACT.primaryTel}`}>
                {CONTACT.primaryPhone}
              </a>
            </p>
            <p>
              <a className={link} href={`mailto:${CONTACT.email}`}>
                {CONTACT.email}
              </a>
            </p>
            <p className="text-text-inverse-muted">{CONTACT.hours}</p>
            <p className="text-text-inverse-muted">{CONTACT.location}</p>
          </address>
          <ul className="mt-5 flex gap-5">
            <li>
              <a className={link} href={CONTACT.instagram} target="_blank" rel="noopener noreferrer">
                Instagram<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
            <li>
              <a className={link} href={CONTACT.facebook} target="_blank" rel="noopener noreferrer">
                Facebook<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-text-inverse-muted/25">
        <p className="container-page py-6 text-caption text-text-inverse-muted">
          © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
