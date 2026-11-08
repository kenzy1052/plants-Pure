import { PHOTO } from "@/assets/company";
import { cn } from "@/lib/utils";

/** The company's real logo (red ellipse, transparent background). */
export function Logo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <img
      src={PHOTO.logo}
      alt="Plants & Pure — natural oils, herbs and spices"
      width={629}
      height={416}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      className={cn("h-12 w-auto select-none drop-shadow-[0_6px_14px_rgb(143_0_0/0.35)]", className)}
      draggable={false}
    />
  );
}
