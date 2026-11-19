import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Reveal } from "@/components/site/Reveal";
import { BUSINESS } from "@/lib/business";
import { categoriesQuery } from "@/lib/catalogue";
import spicesBottle from "@/assets/ranges/spices-bottle.webp";
import spicesPouch from "@/assets/ranges/spices-pouch.webp";
import herbsBottle from "@/assets/ranges/herbs-bottle.webp";
import herbsPouch from "@/assets/ranges/herbs-pouch.webp";
import oilsBottle from "@/assets/ranges/oils-bottle.webp";
import "./growth.css";

type Shot = { src: string; kind: "bottle" | "pouch"; w: number; h: number; alt: string };

/** Each range pairs its bottle with its pouch (oils are bottle-only). All images are transparent cut-outs. */
const SHOTS: Record<string, Shot[]> = {
  spices: [
    { src: spicesBottle, kind: "bottle", w: 333, h: 900, alt: "Plants & Pure cinnamon powder in a shaker bottle" },
    { src: spicesPouch, kind: "pouch", w: 560, h: 900, alt: "Plants & Pure cinnamon powder in a resealable pouch" },
  ],
  herbs: [
    { src: herbsBottle, kind: "bottle", w: 375, h: 900, alt: "Plants & Pure rosemary powder in a shaker bottle" },
    { src: herbsPouch, kind: "pouch", w: 579, h: 900, alt: "Plants & Pure rosemary powder in a resealable pouch" },
  ],
  oils: [{ src: oilsBottle, kind: "bottle", w: 238, h: 900, alt: "Plants & Pure virgin coconut oil bottle" }],
};

function GrainStalks() {
  const grains = Array.from({ length: 6 }, (_, i) => i);
  const stalk = (x: number, h: number, tilt: number) => (
    <g transform={`translate(${x} 200) rotate(${tilt})`} key={x}>
      <path d={`M0 0 C 2 -${h * 0.4}, -2 -${h * 0.7}, 0 -${h}`} stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
      {grains.map((g) => (
        <g key={g} transform={`translate(0 -${h - 8 - g * 17})`}>
          <ellipse cx="-8" cy="0" rx="4.5" ry="10" transform="rotate(-32 -8 0)" fill="currentColor" opacity={0.95 - g * 0.06} />
          <ellipse cx="8" cy="0" rx="4.5" ry="10" transform="rotate(32 8 0)" fill="currentColor" opacity={0.95 - g * 0.06} />
        </g>
      ))}
      <ellipse cx="0" cy={-h - 8} rx="4" ry="11" fill="currentColor" />
    </g>
  );
  return (
    <svg viewBox="0 0 220 210" role="img" aria-label="Illustration of grain stalks">
      {stalk(60, 170, -7)}
      {stalk(110, 195, 0)}
      {stalk(160, 160, 8)}
    </svg>
  );
}

/** "Shop by range": four cards in one 4:5 frame, one shared background style, fully responsive. */
export function RangeShowcase() {
  const categories = useQuery(categoriesQuery());
  return (
    <div className="range-grid">
      {BUSINESS.ranges.map((r, i) => {
        const live = r.dbSlug ? categories.data?.find((x) => x.slug === r.dbSlug) : undefined;
        const soon = r.status === "soon";
        const shots = SHOTS[r.key] ?? [];
        const body = (
          <>
            <span className="range-ring" aria-hidden />
            <div className="range-copy">
              <p className="range-kicker">{soon ? `Range 0${i + 1}` : live && live.productCount > 0 ? `${live.productCount} products` : `Range 0${i + 1}`}</p>
              <h3 className="range-name">{r.name}</h3>
              <p className="range-desc">{r.description}</p>
            </div>
            {soon ? (
              <>
                <span className="range-pill">Coming soon</span>
                <div className="range-soon-art" aria-hidden>
                  <GrainStalks />
                </div>
                <span className="range-notify">
                  <Bell className="h-3.5 w-3.5" /> Notify me
                </span>
              </>
            ) : (
              <>
                <span className="range-go" aria-hidden>
                  <ArrowUpRight className="h-4 w-4" />
                </span>
                <div className="range-stage">
                  {shots.map((s) => (
                    <img key={s.kind} src={s.src} alt={s.alt} width={s.w} height={s.h} data-kind={s.kind} loading="lazy" decoding="async" className="range-img" />
                  ))}
                </div>
              </>
            )}
          </>
        );
        return (
          <Reveal key={r.key} variant="scale" delay={i * 90}>
            {soon ? (
              <a href="#subscribe" className="range-card" data-tone={r.key} data-soon="true" aria-label="Cereals are coming soon. Join our updates to be notified.">
                {body}
              </a>
            ) : (
              <Link to="/shop" search={{ category: r.dbSlug ?? undefined }} className="range-card" data-tone={r.key} aria-label={`Shop ${r.name}`}>
                {body}
              </Link>
            )}
          </Reveal>
        );
      })}
    </div>
  );
}
