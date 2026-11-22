import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BUSINESS } from "@/lib/business";
import "./growth.css";

/** How long each chapter stays lit before the flame sets off for the next one (ms). */
const DWELL_MS = 4800;
/** Travel time for one hop along the line (seconds); extra hops add a little more. */
const hopSeconds = (hops: number) => Math.min(2.8, 1.3 + (hops - 1) * 0.45);

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
 * "Our journey so far". The first year glows; a flame then races along the line to the next year, the node
 * pops when it arrives, the year rolls over and the story slides in. Then it carries on, in order.
 * It runs by itself while on screen, pauses on hover/focus, and can be driven by tapping a year, the arrows,
 * swiping or the keyboard.
 */
export function JourneyTimeline({ id = "journey" }: { id?: string }) {
  const items = BUSINESS.journey;
  const last = items.length - 1;
  const [active, setActive] = useState(0);
  const [travel, setTravel] = useState<{ to: number; dur: number } | null>(null);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true); // assume reduced until the client says otherwise (no SSR flash)
  const rootRef = useRef<HTMLElement>(null);
  const touchX = useRef<number | null>(null);
  const arrive = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => () => { if (arrive.current) clearTimeout(arrive.current); }, []);

  /** Send the flame to a chapter; the node only takes focus once the flame has arrived. */
  const goTo = useCallback(
    (to: number, forceDur?: number) => {
      const target = Math.max(0, Math.min(last, to));
      if (arrive.current) clearTimeout(arrive.current);
      if (target === active && !travel) return;
      const from = travel ? travel.to : active;
      if (target === from && travel) return;
      const hops = Math.abs(target - active);
      if (reduced || hops === 0) {
        setTravel(null);
        setActive(target);
        return;
      }
      const dur = forceDur ?? hopSeconds(hops);
      setTravel({ to: target, dur });
      arrive.current = setTimeout(() => {
        setActive(target);
        setTravel(null);
      }, dur * 1000 + 40);
    },
    [active, travel, last, reduced],
  );

  // Autoplay: dwell on the lit chapter, then send the flame onwards (and back to the start after the last one).
  useEffect(() => {
    if (!inView || paused || reduced || travel) return;
    const t = setTimeout(() => goTo(active >= last ? 0 : active + 1, active >= last ? 1.8 : undefined), DWELL_MS);
    return () => clearTimeout(t);
  }, [inView, paused, reduced, travel, active, last, goTo]);

  const onKey = (e: KeyboardEvent) => {
    const at = travel ? travel.to : active;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goTo(at + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goTo(at - 1); }
    else if (e.key === "Home") { e.preventDefault(); goTo(0); }
    else if (e.key === "End") { e.preventDefault(); goTo(last); }
  };
  const onPointerDown = (e: PointerEvent) => { touchX.current = e.clientX; };
  const onPointerUp = (e: PointerEvent) => {
    if (touchX.current == null) return;
    const dx = e.clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 48) goTo((travel ? travel.to : active) + (dx < 0 ? 1 : -1));
  };

  const shown = travel ? travel.to : active;
  const p = last === 0 ? 0 : shown / last;
  const current = items[active]!;
  const forward = travel && travel.to > active;

  return (
    <section
      ref={rootRef}
      id={id}
      aria-label="Our journey so far"
      className="journey scroll-mt-28"
      data-travel={Boolean(travel)}
      style={{ "--p": p, "--travel-dur": `${travel?.dur ?? 0}s` } as CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="journey-orb" data-k="red" aria-hidden />
      <span className="journey-orb" data-k="amber" aria-hidden />

      <div role="tablist" aria-label="Milestones" className="journey-track" onKeyDown={onKey}>
        <span className="journey-line" aria-hidden />
        <span className="journey-fill" aria-hidden />
        <span className="journey-head" aria-hidden>
          <span className="journey-tail" />
          <span className="journey-core" />
          <span className="journey-ember" />
          <span className="journey-ember" />
          <span className="journey-ember" />
        </span>
        {items.map((it, i) => {
          const passing = Boolean(forward && travel && i > active && i < travel.to);
          const retreating = Boolean(travel && travel.to < active && i > travel.to && i <= active);
          const lit = retreating ? false : i <= active || passing;
          const delay = passing && travel ? ((i - active) / (travel.to - active)) * travel.dur : retreating && travel ? ((active - i) / (active - travel.to)) * travel.dur : 0;
          return (
            <button
              key={it.year}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={i === active}
              aria-controls={`${id}-panel-${i}`}
              tabIndex={i === active ? 0 : -1}
              data-lit={lit}
              data-pass={passing}
              className="journey-node"
              style={{ "--at": last === 0 ? 0 : i / last, "--lit-delay": `${delay.toFixed(2)}s` } as CSSProperties}
              onClick={() => goTo(i)}
            >
              <span className="journey-dot" />
              <span className="journey-year">
                <span className="sm:hidden">’{it.year.slice(2)}</span>
                <span className="hidden sm:inline">{it.year}</span>
              </span>
            </button>
          );
        })}
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
              <h3 className="type-section text-night-foreground">{it.title}</h3>
              <p className="type-lead mt-4 max-w-lg text-night-foreground/75">{it.body}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-end gap-2">
        <button type="button" className="journey-ctrl" aria-label="Previous milestone" disabled={active === 0} onClick={() => goTo(shown - 1)}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button type="button" className="journey-ctrl" aria-label="Next milestone" disabled={active === last} onClick={() => goTo(shown + 1)}>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
