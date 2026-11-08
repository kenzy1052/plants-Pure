import { useEffect, useRef } from "react";

/** Thin red→lime reading-progress line along the bottom edge of the header. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      ref.current?.style.setProperty("--p", max > 0 ? String(Math.min(1, window.scrollY / max)) : "0");
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} aria-hidden className="scroll-progress pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-pepper via-[var(--red-to)] to-lime" />;
}
