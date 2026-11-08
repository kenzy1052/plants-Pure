import { cn } from "@/lib/utils";
import { formatGHS } from "@/lib/money";

/**
 * Price display. A struck-through "was" price is shown ONLY when the database
 * supplies compare_at_price greater than price (enforced by a CHECK constraint),
 * so it can never be a made-up discount.
 */
export function Price({ amount, compareAt, size = "md", className }: { amount: number; compareAt?: number | null; size?: "md" | "lg"; className?: string }) {
  const onSale = typeof compareAt === "number" && compareAt > amount;
  return (
    <p className={cn("numeral flex flex-wrap items-baseline gap-x-2.5", className)}>
      <span className={cn("font-semibold", size === "lg" ? "text-h3 font-display font-normal" : "text-body")}>{formatGHS(amount)}</span>
      {onSale && (
        <>
          <s className="text-small text-text-muted">
            <span className="sr-only">Was </span>
            {formatGHS(compareAt)}
          </s>
        </>
      )}
    </p>
  );
}
