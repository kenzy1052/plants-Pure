import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Empty / error / not-found block: says what happened and offers a next step. */
export function EmptyState({ title, children, action, className, tone = "neutral" }: { title: string; children?: ReactNode; action?: ReactNode; className?: string; tone?: "neutral" | "error" }) {
  return (
    <div className={cn("border-y border-border py-14 text-center", className)} role={tone === "error" ? "alert" : "status"}>
      <h2 className={cn("font-display text-h3", tone === "error" && "text-danger")}>{title}</h2>
      {children && <div className="mx-auto mt-3 max-w-prose text-text-secondary">{children}</div>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
