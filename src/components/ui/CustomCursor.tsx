"use client";

import { useEffect, useRef } from "react";

/**
 * Custom cursor — a minimal dot + trailing ring + a trailing line.
 *
 * - Only appears on fine-pointer devices (CSS hides it on touch/reduced-motion)
 * - Dot tracks exact mouse position; ring interpolates with lerp (smooth lag)
 * - TRAILING LINE: a thin gold horizontal line that extends from the ring toward
 *   the dot, diminishing/fading as it lags — creates a sleek "motion trail" effect
 *   that vanishes when hovering interactive elements or clicking.
 * - All three elements respect prefers-reduced-motion (hidden via CSS)
 */
export function CustomCursor() {
  const dotRef   = useRef<HTMLDivElement>(null);
  const ringRef  = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);

  // current raw position (dot target)
  const dotPos    = useRef({ x: -100, y: -100 });
  // smooth ring position (lerps toward dot)
  const ringPos   = useRef({ x: -100, y: -100 });
  // previous ring pos (for trail direction)
  const prevRing  = useRef({ x: -100, y: -100 });

  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const dot   = dotRef.current;
    const ring  = ringRef.current;
    const trail = trailRef.current;
    if (!dot || !ring || !trail) return;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    // Raw mouse position
    const onMove = (e: MouseEvent) => {
      dotPos.current = { x: e.clientX, y: e.clientY };
    };

    const onEnter = () => document.body.classList.add("cursor-hover");
    const onLeave = () => document.body.classList.remove("cursor-hover");
    const onDown  = () => document.body.classList.add("cursor-click");
    const onUp    = () => document.body.classList.remove("cursor-click");

    // Smooth animation loop
    const animate = () => {
      // Save previous ring pos
      prevRing.current = { ...ringPos.current };

      // Ring lags behind dot with lerp
      ringPos.current.x = lerp(ringPos.current.x, dotPos.current.x, 0.10);
      ringPos.current.y = lerp(ringPos.current.y, dotPos.current.y, 0.10);

      // Dot: immediate
      if (dot) {
        dot.style.left = `${dotPos.current.x}px`;
        dot.style.top  = `${dotPos.current.y}px`;
      }

      // Ring: lagged
      if (ring) {
        ring.style.left = `${ringPos.current.x}px`;
        ring.style.top  = `${ringPos.current.y}px`;
      }

      // Trail: extends from ring to dot direction, fading in opacity
      if (trail) {
        const dx = dotPos.current.x - ringPos.current.x;
        const dy = dotPos.current.y - ringPos.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Trail goes from ring toward dot direction
        const trailLength = Math.min(dist * 0.6, 60); // capped at 60px
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        trail.style.left   = `${ringPos.current.x}px`;
        trail.style.top    = `${ringPos.current.y}px`;
        trail.style.width  = `${trailLength}px`;
        trail.style.transform = `translateY(-50%) rotate(${angle}deg)`;

        // Opacity fades the further the dot is from ring
        const opacity = dist > 4 ? Math.max(0, 1 - dist / 120) * 0.6 : 0;
        trail.style.opacity = String(opacity);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseenter", onEnter);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseenter", onEnter);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <div ref={dotRef}   className="cursor-dot"   aria-hidden="true" />
      <div ref={ringRef}  className="cursor-ring"  aria-hidden="true" />
      <div ref={trailRef} className="cursor-trail" aria-hidden="true" />
    </>
  );
}
