import { useEffect, useRef, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PHOTO } from "@/assets/company";
import { BUSINESS } from "@/lib/business";

/**
 * Studio hero. The company's own bottle photography sits on a black "stage" with a red glow; the
 * photos are feathered into the background so they read as products lit in a studio rather than
 * as pictures in boxes. Pointer movement nudges each bottle by a different depth.
 */
const PLATES = [
  { src: PHOTO.garlic, alt: "Plants & Pure garlic powder in a shaker bottle", cls: "left-0 top-[14%] w-[35%]", depth: 10, i: 3 },
  { src: PHOTO.curry, alt: "Plants & Pure curry powder in a shaker bottle", cls: "right-0 top-[20%] w-[35%]", depth: 14, i: 4 },
  { src: PHOTO.cinnamon, alt: "Plants & Pure cinnamon powder in a shaker bottle", cls: "left-[26%] top-0 w-[48%]", depth: 26, i: 2 },
] as const;

export function Hero() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        el.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      });
    };
    const onLeave = () => {
      el.style.setProperty("--mx", "0");
      el.style.setProperty("--my", "0");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section aria-labelledby="hero-title">
      <noscript>
        <style>{".hero-item{opacity:1!important}.hero-line>span{transform:none!important}"}</style>
      </noscript>
      <div className="stage grain relative overflow-hidden text-night-foreground">
        {/* Slow red breathing light behind the bottles */}
        <div aria-hidden className="pointer-events-none absolute -right-[10%] top-[8%] h-[70%] w-[60%] animate-glow rounded-full bg-[radial-gradient(closest-side,rgb(227_27_27/0.35),transparent)] blur-2xl" />

        <div className="container-page relative grid items-center gap-6 pb-10 pt-[7.5rem] sm:pt-[8.5rem] lg:min-h-[51rem] lg:grid-cols-12 lg:gap-4 lg:pb-14">
          <div className="relative z-10 lg:col-span-5">
            <p className="hero-item type-small inline-flex items-center gap-2 rounded-full bg-night-foreground/5 px-4 py-2 text-night-foreground/90 ring-1 ring-night-foreground/10 backdrop-blur" style={{ "--i": 0 } as CSSProperties}>
              <span className="h-1.5 w-1.5 rounded-full bg-lime" aria-hidden />
              Healthy living on the go
            </p>

            <h1 id="hero-title" className="type-hero mt-7 font-light">
              <span className="hero-line" style={{ "--i": 1 } as CSSProperties}>
                <span>Quality spices,</span>
              </span>
              <span className="hero-line" style={{ "--i": 2 } as CSSProperties}>
                <span className="italic text-night-accent">herbs and oils.</span>
              </span>
            </h1>

            <p className="hero-item type-lead mt-7 max-w-md text-night-muted" style={{ "--i": 4 } as CSSProperties}>
              Wholesome, natural spices, herbs and oils from Accra, prepared with strict attention to quality, authenticity and trust.
            </p>

            <div className="hero-item mt-9 flex flex-wrap items-center gap-3" style={{ "--i": 5 } as CSSProperties}>
              <Button asChild variant="pepper" size="lg" className="bg-brand-gradient hover:brightness-110">
                <Link to="/shop">
                  Shop the collection <ArrowRight className="transition-transform duration-300 group-hover/btn:translate-x-1" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="text-night-foreground ring-1 ring-night-foreground/20 hover:bg-night-foreground/10">
                <Link to="/" hash="stockists">
                  <MapPin /> Find us in store
                </Link>
              </Button>
            </div>

            <p className="hero-item type-small mt-10 text-night-muted" style={{ "--i": 6 } as CSSProperties}>
              Established {BUSINESS.foundedYear} · Accra, Ghana
            </p>
          </div>

          <div ref={stageRef} className="relative z-0 mx-auto aspect-[1/1] w-full max-w-[40rem] sm:aspect-[6/5] lg:col-span-7 lg:aspect-auto lg:h-[40rem] lg:max-w-none" style={{ "--mx": 0, "--my": 0 } as CSSProperties}>
            {PLATES.map((p) => (
              <div
                key={p.alt}
                className={`absolute ${p.cls}`}
                style={{ transform: `translate3d(calc(var(--mx) * ${-p.depth}px), calc(var(--my) * ${-p.depth}px), 0)`, transition: "transform 0.6s var(--ease-settle)" }}
              >
                <img
                  src={p.src}
                  alt={p.alt}
                  width={739}
                  height={1069}
                  decoding="async"
                  fetchPriority={p.i === 2 ? "high" : "auto"}
                  className="hero-item feather h-auto w-full select-none"
                  style={{ "--i": p.i + 1 } as CSSProperties}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
