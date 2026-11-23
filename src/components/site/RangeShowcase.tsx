import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { BUSINESS } from "@/lib/business";
import spicesBottle from "@/assets/ranges/spices-bottle.webp";
import spicesPouch from "@/assets/ranges/spices-pouch.webp";
import herbsBottle from "@/assets/ranges/herbs-bottle.webp";
import herbsPouch from "@/assets/ranges/herbs-pouch.webp";
import oilsBottle from "@/assets/ranges/oils-bottle.webp";
import "./growth.css";

/**
 * Each live range shows its real packs (transparent cut-outs) standing on a studio podium, seen from the front.
 * The coming-soon range has no photo on purpose: just a quiet typographic card.
 */
type Item = { src: string; alt: string; w: number; h: number; size?: "sm" };
const STAGES: Record<string, Item[]> = {
  spices: [
    { src: spicesBottle, alt: "Plants & Pure cinnamon powder bottle", w: 333, h: 900, size: "sm" },
    { src: spicesPouch, alt: "Plants & Pure cinnamon powder pouch", w: 560, h: 900 },
  ],
  herbs: [
    { src: herbsBottle, alt: "Plants & Pure anise seeds bottle", w: 375, h: 900, size: "sm" },
    { src: herbsPouch, alt: "Plants & Pure anise seeds pouch", w: 579, h: 900 },
  ],
  oils: [{ src: oilsBottle, alt: "Plants & Pure virgin coconut oil bottle", w: 238, h: 900 }],
};

export function RangeShowcase() {
  return (
    <div className="range-grid">
      {BUSINESS.ranges.map((r, i) => {
        const soon = r.status === "soon";
        const items = STAGES[r.key] ?? [];
        return (
          <Reveal key={r.key} variant="scale" delay={i * 90}>
            {soon ? (
              <a href="#subscribe" className="range-card" data-soon="true" aria-label="Cereals are coming soon. Join our updates to be notified.">
                <div className="range-copy">
                  <span className="range-pill">Coming soon</span>
                  <h3 className="range-name">{r.name}</h3>
                  <p className="range-desc">{r.description}</p>
                </div>
                <div className="range-soon-mark" aria-hidden>Soon</div>
                <span className="range-notify">
                  <Bell className="h-3.5 w-3.5" /> Notify me
                </span>
              </a>
            ) : (
              <Link to="/shop" search={{ category: r.dbSlug ?? undefined }} className="range-card" aria-label={`Shop ${r.name}`}>
                <div className="range-copy">
                  <h3 className="range-name">{r.name}</h3>
                  <p className="range-desc">{r.description}</p>
                  <span className="range-cta">Shop {r.name.toLowerCase()} <ArrowRight className="h-3.5 w-3.5" /></span>
                </div>
                <div className="range-stage" aria-hidden={false}>
                  <span className="range-podium" aria-hidden />
                  <div className="range-products">
                    {items.map((it) => (
                      <img key={it.src} src={it.src} alt={it.alt} width={it.w} height={it.h} loading="lazy" decoding="async" className="range-item" data-size={it.size} />
                    ))}
                  </div>
                </div>
              </Link>
            )}
          </Reveal>
        );
      })}
    </div>
  );
}
