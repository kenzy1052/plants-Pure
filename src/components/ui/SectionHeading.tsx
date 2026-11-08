import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Section opener: index numeral + eyebrow label, serif heading, optional lead. */
export function SectionHeading({ index, eyebrow, title, lead, className, inverse }: { index?: string; eyebrow: string; title: ReactNode; lead?: ReactNode; className?: string; inverse?: boolean }) {
  return (
    <header className={cn("max-w-3xl", className)}>
      <p className={cn("eyebrow flex items-center gap-3", inverse ? "text-text-inverse-muted" : "text-text-muted")}>
        {index && <span className="numeral">{index}</span>}
        {index && <span aria-hidden="true" className={cn("h-px w-8", inverse ? "bg-text-inverse-muted" : "bg-border-strong")} />}
        <span>{eyebrow}</span>
      </p>
      <h2 className="mt-4 text-h2">{title}</h2>
      {lead && <p className={cn("mt-4 text-lead max-w-prose", inverse ? "text-text-inverse-muted" : "text-text-secondary")}>{lead}</p>}
    </header>
  );
}
