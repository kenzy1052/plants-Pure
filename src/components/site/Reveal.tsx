import { useEffect, useRef, type ElementType, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type RevealVariant = "rise" | "fade" | "scale" | "left" | "right" | "mask";

/**
 * Scroll reveal that works in both directions: elements animate in whenever they enter the
 * viewport (scrolling down or back up) and reset when they leave, so every section "arrives".
 * Reduced motion is handled in CSS.
 */
export function Reveal({
  as: Tag = "div",
  children,
  className,
  delay = 0,
  variant = "rise",
  ...rest
}: { as?: ElementType; children: ReactNode; className?: string; delay?: number; variant?: RevealVariant } & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          el.dataset.in = "true";
        } else {
          el.dataset.in = "false";
          el.dataset.dir = entry.boundingClientRect.top < 0 ? "up" : "down";
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      data-variant={variant === "rise" ? undefined : variant}
      className={cn("reveal reveal-up", className)}
      style={{ "--d": `${delay}ms` } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
