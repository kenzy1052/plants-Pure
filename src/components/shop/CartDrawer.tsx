import { Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cartSubtotal, useCart } from "@/lib/cart-store";
import { formatGHS } from "@/lib/money";
import { ProductImage } from "./ProductCard";

export function CartDrawer() {
  const { lines, isOpen, close, setQuantity, remove } = useCart();
  const subtotal = cartSubtotal(lines);
  return (
    <Sheet open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 border-l border-border bg-background p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <SheetTitle className="type-sub font-normal">Your cart</SheetTitle>
          <SheetDescription className="type-small">{lines.length ? `${lines.length} item${lines.length > 1 ? "s" : ""}` : "Nothing here yet"}</SheetDescription>
        </SheetHeader>
        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sage text-forest">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p className="type-body text-muted-foreground">Your cart is empty. Explore our spices, herbs and natural oils.</p>
            <Button asChild variant="default" onClick={close}>
              <Link to="/shop">Browse the shop</Link>
            </Button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-6">
              {lines.map((l) => (
                <li key={l.productId} className="flex gap-4 py-5">
                  <Link to="/product/$slug" params={{ slug: l.slug }} onClick={close} className="h-24 w-20 shrink-0 overflow-hidden rounded-2xl bg-container">
                    <ProductImage src={l.image} alt={l.title} w={200} />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <Link to="/product/$slug" params={{ slug: l.slug }} onClick={close} className="type-product link-line truncate">
                        {l.title}
                      </Link>
                      <button type="button" onClick={() => remove(l.productId)} aria-label={`Remove ${l.title}`} className="rounded-full p-1 text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="type-small text-muted-foreground">{formatGHS(l.price)}{l.weightGrams ? ` · ${l.weightGrams} g` : ""}</p>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="inline-flex items-center rounded-full border border-border">
                        <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(l.productId, l.quantity - 1)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-container">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">{l.quantity}</span>
                        <button type="button" aria-label="Increase quantity" disabled={l.quantity >= l.stock} onClick={() => setQuantity(l.productId, l.quantity + 1)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-container disabled:opacity-40">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="type-small font-medium tabular-nums">{formatGHS(l.price * l.quantity)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border bg-surface px-6 py-6">
              <div className="flex items-baseline justify-between">
                <span className="type-small text-muted-foreground">Subtotal</span>
                <span className="type-sub tabular-nums">{formatGHS(subtotal)}</span>
              </div>
              <p className="type-small mt-1 text-muted-foreground">Delivery is calculated at checkout.</p>
              <Button asChild variant="pepper" size="lg" className="mt-5 w-full" onClick={close}>
                <Link to="/checkout">Checkout</Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
