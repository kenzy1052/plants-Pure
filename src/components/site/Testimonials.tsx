import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { Stars } from "@/components/shop/Stars";
import { testimonialsQuery, testimonialsVisible, type Testimonial } from "@/lib/testimonials";
import "./growth.css";

export function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <figure className="testimonial-card">
      <Stars value={t.rating} />
      {t.title && <p className="type-product mt-3">{t.title}</p>}
      <blockquote className="type-small mt-2 whitespace-pre-line text-foreground/85">{t.body}</blockquote>
      <figcaption className="type-small mt-4 flex items-center gap-1.5 font-semibold">
        {t.name}
        <span className="inline-flex items-center gap-1 text-xs font-medium text-olive">
          <BadgeCheck className="h-3.5 w-3.5" /> Verified order
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Customer reviews. Renders NOTHING (no heading, no "loading") until enough reviews have been approved
 * in the admin (see MIN_TESTIMONIALS_TO_SHOW in src/lib/testimonials.ts).
 */
export function Testimonials({ limit = 6, withLink = true }: { limit?: number; withLink?: boolean }) {
  const q = useQuery(testimonialsQuery());
  if (!testimonialsVisible(q.data)) return null;
  const d = q.data;
  return (
    <section className="container-page pt-24 sm:pt-32" aria-labelledby="reviews-heading">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Reveal>
          <p className="type-small font-semibold text-brand">Loved in kitchens across Ghana</p>
          <h2 id="reviews-heading" className="type-section mt-2 max-w-2xl">Kind words from our customers.</h2>
          {d.average != null && (
            <p className="type-body mt-3 flex items-center gap-3 text-muted-foreground">
              <Stars value={d.average} />
              <span><strong className="text-foreground">{d.average.toFixed(1)}</strong> from {d.count} verified orders</span>
            </p>
          )}
        </Reveal>
        {withLink && (
          <Reveal delay={120}>
            <Link to="/testimonials" className="type-small inline-flex items-center gap-1 font-semibold hover:text-brand">
              Read all reviews <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        )}
      </div>
      <div className="testimonial-grid mt-10">
        {d.items.slice(0, limit).map((t, i) => (
          <Reveal key={t.id} delay={(i % 3) * 90}>
            <TestimonialCard t={t} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
