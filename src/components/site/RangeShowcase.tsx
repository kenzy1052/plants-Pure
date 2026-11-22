import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { BUSINESS } from "@/lib/business";
import spices from "@/assets/ranges/scene-spices.webp";
import herbs from "@/assets/ranges/scene-herbs.webp";
import oils from "@/assets/ranges/scene-oils.webp";
import cereals from "@/assets/ranges/scene-cereals.webp";
import "./growth.css";

/**
 * Each range is one photo: its products (bottle + pouch, or both oils) standing on a wooden table with real
 * shadows. All four images share the same 4:5 frame, so nothing is cropped on any screen size.
 */
const SCENES: Record<string, { src: string; alt: string }> = {
  spices: { src: spices, alt: "Plants & Pure cinnamon powder in a bottle and a pouch on a wooden table" },
  herbs: { src: herbs, alt: "Plants & Pure anise seeds in a bottle and a pouch on a wooden table" },
  oils: { src: oils, alt: "Plants & Pure virgin coconut oil in a bottle and a jar on a wooden table" },
  cereals: { src: cereals, alt: "A heap of wholesome grain on a wooden table: Plants & Pure cereals are coming soon" },
};

export function RangeShowcase() {
  return (
    <div className="range-grid">
      {BUSINESS.ranges.map((r, i) => {
        const soon = r.status === "soon";
        const scene = SCENES[r.key]!;
        const body = (
          <>
            <img src={scene.src} alt={scene.alt} width={880} height={1100} loading="lazy" decoding="async" className="range-photo" />
            <div className="range-copy">
              {soon && <span className="range-pill">Coming soon</span>}
              <h3 className="range-name">{r.name}</h3>
              <p className="range-desc">{r.description}</p>
            </div>
            {soon && (
              <span className="range-notify">
                <Bell className="h-3.5 w-3.5" /> Notify me
              </span>
            )}
          </>
        );
        return (
          <Reveal key={r.key} variant="scale" delay={i * 90}>
            {soon ? (
              <a href="#subscribe" className="range-card" data-soon="true" aria-label="Cereals are coming soon. Join our updates to be notified.">
                {body}
              </a>
            ) : (
              <Link to="/shop" search={{ category: r.dbSlug ?? undefined }} className="range-card" aria-label={`Shop ${r.name}`}>
                {body}
              </Link>
            )}
          </Reveal>
        );
      })}
    </div>
  );
}
