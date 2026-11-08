"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Quantity control with 44px targets, named buttons, and an announced value. */
export function QuantityStepper({ value, onChange, min = 1, max = 100, label = "Quantity", className }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label?: string; className?: string }) {
  const btn = "grid size-11 place-items-center text-text transition-colors hover:bg-background-alt disabled:text-disabled-text disabled:hover:bg-transparent";
  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center rounded-control border border-border-strong bg-surface", className)}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label.toLowerCase()}`}>
        <Minus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
      <output aria-live="polite" className="numeral min-w-10 text-center font-semibold">
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label.toLowerCase()}`}>
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
