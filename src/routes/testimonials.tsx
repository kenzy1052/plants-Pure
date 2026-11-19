import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Reveal } from "@/components/site/Reveal";
import { TestimonialCard } from "@/components/site/Testimonials";
import { Stars } from "@/components/shop/Stars";
import { Button } from "@/components/ui/button";
import { testimonialsQuery, testimonialsVisible } from "@/lib/testimonials";

export const Route = createFileRoute("/testimonials")({
  head: () => ({
    meta: [
      { title: "Customer reviews | Plants & Pure" },
      { name: "description", content: "What customers say about Plants & Pure spices, herbs and oils: verified reviews from real orders." },
      { property: "og:title", content: "Customer reviews — Plants & Pure" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://www.plantsandpure.com/testimonials" }],
  }),
  component: TestimonialsPage,
});

function TestimonialsPage() {
  const q = useQuery(testimonialsQuery());
  if (q.isPending) return <div className="min-h-[60vh]" aria-hidden />; // silent: nothing to announce yet
  // Below the approval threshold the page simply doesn't exist for visitors.
  if (!testimonialsVisible(q.data)) return <Navigate to="/" replace />;
  const d = q.data;
  return (
    <div className="container-page pb-8 pt-32 sm:pt-40">
      <Reveal>
        <p className="type-small font-semibold text-brand">Customer reviews</p>
        <h1 className="type-page mt-3 max-w-3xl">Real words from real orders.</h1>
        {d.average != null && (
          <p className="type-lead mt-5 flex flex-wrap items-center gap-3 text-muted-foreground">
            <Stars value={d.average} className="[&_svg]:h-5 [&_svg]:w-5" />
            <span><strong className="text-foreground">{d.average.toFixed(1)}</strong> average · {d.count} verified orders</span>
          </p>
        )}
      </Reveal>
      <div className="testimonial-grid mt-12">
        {d.items.map((t, i) => (
          <Reveal key={t.id} delay={(i % 3) * 80}>
            <TestimonialCard t={t} />
          </Reveal>
        ))}
      </div>
      <Reveal className="mt-10 text-center">
        <p className="type-body text-muted-foreground">Ordered from us recently? Use the tracking code in your receipt to share your experience once it arrives.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="pepper" size="lg"><Link to="/shop">Shop the range</Link></Button>
          <Button asChild variant="outline" size="lg"><Link to="/track">Track an order</Link></Button>
        </div>
      </Reveal>
    </div>
  );
}
