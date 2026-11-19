import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BUSINESS } from "@/lib/business";
import "./growth.css";

/** Seconds each chapter stays in focus before the timeline glides to the next one. */
const INTERVAL_S = 7;

function Odometer({ year }: { year: string }) {
  return (
    <div className="odo" role="img" aria-label={year}>
      {year.split("").map((ch, i) => (
        <span key={i} className="odo-col" aria-hidden style={{ "--d": Number(ch), "--i": i } as CSSProperties}>
          <span className="odo-strip">
            {Array.from({ length: 10 }, (_, n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * "Our journey so far": a kinetic timeline. The line fills to the chapter in focus, the node glows,
 * the year rolls like an odometer and the copy glides across. It advances by itself while on screen,
 * pauses on hover/focus/touch, and can be driven with the dots, arrows, swipes or the keyboard.
 */
export function JourneyTimeline({ id = "journey" }: { id?: string }) {
  const items = BUSINESS.journey;
  const last = items.length - 1;
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true); // assume reduced until the client says otherwise (no SSR flash)
  const rootRef = useRef<HTMLElement>(null);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting)), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const go = useCallback((i: number) => setActive(Math.max(0, Math.min(last, i))), [last]);
  const auto = inView && !reduced;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(active + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(active - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(last); }
  };
  const onPointerDown = (e: PointerEvent) => { touchX.current = e.clientX; };
  const onPointerUp = (e: PointerEvent) => {
    if (touchX.current == null) return;
    const dx = e.clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 48) go(active + (dx < 0 ? 1 : -1));
  };

  const p = last === 0 ? 0 : active / last;
  const current = items[active]!;

  return (
    <section
      ref={rootRef}
      id={id}
      aria-label="Our journey so far"
      className="journey scroll-mt-28"
      data-auto={auto}
      style={{ "--p": p, "--journey-interval": `${INTERVAL_S}s`, "--journey-play": paused ? "paused" : "running" } as CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="journey-orb" data-k="red" aria-hidden />
      <span className="journey-orb" data-k="lime" aria-hidden />

      <div role="tablist" aria-label="Milestones" className="journey-track" onKeyDown={onKey}>
        <span className="journey-line" aria-hidden />
        <span className="journey-fill" aria-hidden />
        {items.map((it, i) => (
          <button
            key={it.year}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            data-done={i < active}
            className="journey-node"
            style={{ "--at": last === 0 ? 0 : i / last } as CSSProperties}
            onClick={() => go(i)}
            // the CSS progress ring finishing is what advances the story (so pausing the ring pauses the story)
            onAnimationEnd={(e) => {
              if (e.animationName === "journey-progress" && i === active) setActive((a) => (a >= last ? 0 : a + 1));
            }}
          >
            <span className="journey-dot">
              <svg className="journey-ring" viewBox="0 0 36 36" aria-hidden>
                <circle className="bg" cx="18" cy="18" r="16" />
                <circle className="fg" cx="18" cy="18" r="16" pathLength={100.5} key={`${active}-${i}`} />
              </svg>
            </span>
            <span className="journey-year">
              <span className="sm:hidden">’{it.year.slice(2)}</span>
              <span className="hidden sm:inline">{it.year}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="journey-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ touchAction: "pan-y" }}>
        <div>
          <Odometer year={current.year} />
          {active === last && <p className="odo-tag">Present</p>}
        </div>

        <div className="journey-slides">
          {items.map((it, i) => (
            <article
              key={it.year}
              role="tabpanel"
              id={`${id}-panel-${i}`}
              aria-labelledby={`${id}-tab-${i}`}
              aria-hidden={i !== active}
              data-state={i === active ? "active" : i < active ? "before" : "after"}
              className="journey-slide"
            >
              <p className="type-small font-semibold uppercase tracking-[0.16em] text-lime">
                {String(i + 1).padStart(2, "0")} <span className="text-night-muted">/ {String(items.length).padStart(2, "0")}</span>
                <span className="mx-2 text-night-muted">·</span>
                {it.label}
              </p>
              <h3 className="type-section mt-3 text-night-foreground">{it.title}</h3>
              <p className="type-lead mt-4 max-w-lg text-night-foreground/75">{it.body}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="type-small text-night-muted">{auto && !paused ? "Moving through our story…" : "Tap a year to jump ahead."}</p>
        <div className="flex gap-2">
          <button type="button" className="journey-ctrl" aria-label="Previous milestone" disabled={active === 0} onClick={() => go(active - 1)}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button type="button" className="journey-ctrl" aria-label="Next milestone" disabled={active === last} onClick={() => go(active + 1)}>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
