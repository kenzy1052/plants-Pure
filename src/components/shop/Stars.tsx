import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only star row (rounds to the nearest whole star). */
export function Stars({ value, className }: { value: number; className?: string }) {
  const n = Math.round(value);
  return (
    <span className={cn("inline-flex gap-0.5 text-[#e0a200]", className)} role="img" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-4 w-4" fill={i < n ? "currentColor" : "none"} strokeWidth={i < n ? 0 : 1.6} />
      ))}
    </span>
  );
}
