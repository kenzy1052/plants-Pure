import { useEffect, useRef } from "react";

const TRAIL = 10;
const INTERACTIVE = 'a, button, [role="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], select, label[for], summary, [data-cursor="hover"]';

/**
 * Custom cursor: a solid green dot on the pointer, a thin hollow ring that follows with a slight
 * delay and expands over clickable elements, and a chain of 10 soft particles that each follow the
 * one ahead (elastic, curved trail) and fade out when the pointer stops.
 * Disabled for touch / coarse pointers and reduced motion; never intercepts clicks.
 */
export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const trailRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    const dot = dotRef.current!;
    const ring = ringRef.current!;
    const parts = trailRefs.current.filter(Boolean) as HTMLDivElement[];
    const pointer = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100 };
    const pts = Array.from({ length: TRAIL }, () => ({ x: -100, y: -100 }));
    let hovering = false;
    let visible = false;
    let lastMove = 0;
    let energy = 0;
    let raf = 0;

    document.documentElement.classList.add("has-custom-cursor");

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!visible) {
        visible = true;
        ringPos.x = pointer.x;
        ringPos.y = pointer.y;
        pts.forEach((p) => ((p.x = pointer.x), (p.y = pointer.y)));
        dot.style.opacity = "1";
        ring.style.opacity = "1";
      }
      lastMove = performance.now();
      const t = e.target as Element | null;
      hovering = !!t?.closest?.(INTERACTIVE);
    };
    const onLeave = () => {
      visible = false;
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    };
    const onDown = () => ring.style.setProperty("--press", "0.82");
    const onUp = () => ring.style.setProperty("--press", "1");

    const tick = () => {
      const now = performance.now();
      const moving = now - lastMove < 90;
      energy += ((moving ? 1 : 0) - energy) * (moving ? 0.25 : 0.06);

      dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;
      ringPos.x += (pointer.x - ringPos.x) * 0.2;
      ringPos.y += (pointer.y - ringPos.y) * 0.2;
      ring.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) translate(-50%, -50%) scale(calc(${hovering ? 1.4 : 1} * var(--press, 1)))`;
      ring.dataset.hover = hovering ? "true" : "false";

      let lx = pointer.x;
      let ly = pointer.y;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const ease = 0.42 - i * 0.022;
        p.x += (lx - p.x) * ease;
        p.y += (ly - p.y) * ease;
        lx = p.x;
        ly = p.y;
        const el = parts[i];
        if (!el) continue;
        const k = 1 - i / pts.length;
        const size = 2 + 6 * k;
        const alpha = 0.55 * k * k * energy * (visible ? 1 : 0);
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.opacity = alpha.toFixed(3);
        el.style.filter = `blur(${(i / pts.length) * 1.6}px)`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.documentElement.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.documentElement.classList.remove("has-custom-cursor");
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999]">
      {Array.from({ length: TRAIL }).map((_, i) => (
        <div key={i} ref={(el) => void (trailRefs.current[i] = el)} className="absolute left-0 top-0 rounded-full bg-cursor opacity-0 will-change-transform" />
      ))}
      <div
        ref={ringRef}
        className="absolute left-0 top-0 h-9 w-9 rounded-full border border-cursor bg-transparent opacity-0 transition-[opacity,border-width] duration-300 will-change-transform data-[hover=true]:border-[0.75px]"
      />
      <div ref={dotRef} className="absolute left-0 top-0 h-[7px] w-[7px] rounded-full bg-cursor opacity-0 will-change-transform" />
    </div>
  );
}
