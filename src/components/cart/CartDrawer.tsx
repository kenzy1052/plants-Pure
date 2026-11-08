"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingBag, Trash2 } from "lucide-react";
import { useCartStore } from "@/context/cart-store";
import { Drawer } from "@/components/ui/Drawer";
import { ButtonLink } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { formatGHS } from "@/lib/money";
import { PRODUCT_PLACEHOLDER } from "@/lib/catalogue/images";

/**
 * Cart drawer. Prices shown are the product prices the browser last loaded;
 * the server re-prices and re-checks stock at checkout (see docs/ARCHITECTURE.md),
 * which the footer note says in plain words. Delivery is NOT estimated here:
 * fees depend on the delivery option chosen at checkout.
 */
export default function CartDrawer() {
  const { items, isOpen, closeCart, updateQuantity, removeItem, getSubtotal } = useCartStore();
  const subtotal = getSubtotal();

  return (
    <Drawer open={isOpen} onClose={closeCart} title="Your cart" side="right">
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-(--gutter) text-center">
          <ShoppingBag className="size-10 text-text-muted" strokeWidth={1.25} aria-hidden="true" />
          <p className="font-display text-h3">Your cart is empty</p>
          <p className="text-text-secondary">Browse the collection and add something you like.</p>
          <ButtonLink href="/shop" onClick={closeCart} variant="primary">
            Shop products
          </ButtonLink>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-border overflow-y-auto px-(--gutter)" aria-label="Items in your cart">
            {items.map(({ product, quantity }) => (
              <li key={product.id} className="grid grid-cols-[5rem_1fr] gap-4 py-5">
                <Link href={`/product/${product.slug}`} onClick={closeCart} className="relative block aspect-4/5 overflow-hidden bg-background-alt">
                  <Image src={product.image_urls?.[0] || PRODUCT_PLACEHOLDER} alt="" fill sizes="80px" className="object-cover" />
                </Link>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/product/${product.slug}`} onClick={closeCart} className="font-display text-product hover:underline underline-offset-4">
                      {product.title}
                    </Link>
                    <p className="numeral shrink-0 font-semibold">{formatGHS(product.price * quantity)}</p>
                  </div>
                  <p className="numeral text-small text-text-muted">{formatGHS(product.price)} each</p>
                  <div className="mt-1 flex items-center justify-between">
                    <QuantityStepper value={quantity} onChange={(n) => updateQuantity(product.id, n)} max={Math.max(1, Math.min(100, product.stock ?? 100))} label={`Quantity of ${product.title}`} />
                    <button type="button" onClick={() => removeItem(product.id)} className="inline-flex h-11 items-center gap-1.5 rounded-control px-2 text-small text-text-secondary hover:text-danger" aria-label={`Remove ${product.title} from cart`}>
                      <Trash2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-border bg-background px-(--gutter) py-5">
            <div className="flex items-baseline justify-between">
              <p className="font-semibold">Subtotal</p>
              <p className="numeral font-display text-h3">{formatGHS(subtotal)}</p>
            </div>
            <p className="mt-1 text-caption text-text-muted">Delivery is added at checkout. Final prices and availability are confirmed when you pay.</p>
            <ButtonLink href="/checkout" onClick={closeCart} variant="accent" size="lg" className="mt-4 w-full">
              Checkout
            </ButtonLink>
          </div>
        </>
      )}
    </Drawer>
  );
}
