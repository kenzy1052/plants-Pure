import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/shop/ProductCard";
import { formatGHS } from "@/lib/money";

/**
 * Quantity + Add to cart that stay on screen while the customer reads, scrolls to related
 * products, and decides. It slides away when the footer comes into view so it never covers it.
 */
export function StickyBuyBar({
  title,
  price,
  compareAt,
  stock,
  qty,
  onQty,
  onAdd,
}: {
  title: string;
  price: number;
  compareAt: number | null;
  stock: number;
  qty: number;
  onQty: (q: number) => void;
  onAdd: () => void;
}) {
  const soldOut = stock <= 0;
  const max = Math.max(1, Math.min(stock, 100));
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setFooterVisible(!!e?.isIntersecting));
    io.observe(footer);
    return () => io.disconnect();
  }, []);

  return (
    <div
      role="region"
      aria-label="Add to cart"
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl transition-transform duration-500 ease-[var(--ease-settle)] ${footerVisible ? "translate-y-full" : "translate-y-0"}`}
    >
      <div className="container-page flex items-center gap-3 py-3">
        <div className="hidden min-w-0 flex-1 sm:block">
          <p className="type-product truncate">{title}</p>
          <Price price={price} compareAt={compareAt} className="type-small text-muted-foreground" />
        </div>

        <div className="inline-flex h-12 shrink-0 items-center rounded-full border border-border bg-surface px-0.5 sm:px-1">
          <button type="button" aria-label="Decrease quantity" disabled={soldOut || qty <= 1} onClick={() => onQty(Math.max(1, qty - 1))} className="flex h-10 w-9 items-center justify-center rounded-full hover:bg-container disabled:opacity-40 sm:w-10">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center tabular-nums sm:w-8" aria-live="polite" aria-label={`Quantity ${qty}`}>{qty}</span>
          <button type="button" aria-label="Increase quantity" disabled={soldOut || qty >= max} onClick={() => onQty(Math.min(max, qty + 1))} className="flex h-10 w-9 items-center justify-center rounded-full hover:bg-container disabled:opacity-40 sm:w-10">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <Button variant="pepper" size="lg" className="h-12 min-w-0 flex-1 px-4 sm:flex-none sm:min-w-64" disabled={soldOut} onClick={onAdd}>
          <ShoppingBag className="max-sm:hidden" />
          <span className="truncate">{soldOut ? "Sold out" : `Add to cart · ${formatGHS(price * qty)}`}</span>
        </Button>
      </div>
    </div>
  );
}
