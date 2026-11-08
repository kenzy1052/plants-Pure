"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCartStore } from "@/context/cart-store";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { PRODUCT_PLACEHOLDER } from "@/lib/catalogue/images";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Foodo-inspired Product Card
 *
 * Premium botanical product presentation:
 * - 4:5 portrait image with subtle hover zoom
 * - Badge (sold out / featured / sale) — top-left, pill style
 * - Product name as clean serif heading (NewYork font)
 * - Weight shown when available
 * - Price (current + struck compare-at if on sale)
 * - Add to cart — bottom overlay, fades up on card hover
 *
 * The image IS the product. Every layout decision serves the photography.
 */
export default function ProductCard({ product, fit = "cover", priority = false, className }: { product: Product; fit?: "cover" | "contain"; priority?: boolean; className?: string }) {
  const addItem  = useCartStore((s) => s.addItem);
  const soldOut = (product.stock ?? 0) <= 0;
  const onSale  = typeof product.compare_at_price === "number" && product.compare_at_price > product.price;
  const [broken, setBroken] = useState(false);
  const image   = broken ? undefined : product.image_urls?.[0];

  return (
    <article className={cn("group relative flex flex-col", className)}>
      {/* ── Image ────────────────────────────────────── */}
      <div className="relative aspect-[4/5] overflow-hidden bg-background-alt">
        <Image
          src={image || PRODUCT_PLACEHOLDER}
          alt=""
          fill
          priority={priority}
          onError={() => setBroken(true)}
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw"
          className={cn(
            "object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]",
            fit === "contain" ? "object-contain p-5" : "",
            soldOut && "opacity-50 grayscale-[30%]"
          )}
        />

        {/* Badges — top-left */}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {soldOut && <Badge tone="neutral" className="bg-background/90 backdrop-blur-sm">Sold out</Badge>}
          {onSale && !soldOut && <Badge tone="accent">Sale</Badge>}
          {!soldOut && product.is_featured && <Badge tone="neutral" className="bg-background/90 backdrop-blur-sm">Featured</Badge>}
        </div>

        {/* Add to cart — slides up from bottom on card hover */}
        <div className={cn(
          "absolute inset-x-3 bottom-3 transition-all duration-300 ease-out",
          "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0",
          soldOut && "pointer-events-none"
        )}>
          <button
            type="button"
            disabled={soldOut}
            onClick={(e) => { e.preventDefault(); addItem(product, 1); }}
            aria-label={soldOut ? `${product.title} is unavailable` : `Add to cart: ${product.title}`}
            className={cn(
              "w-full h-11 rounded-[10px] bg-background/95 backdrop-blur-sm",
              "border border-border-strong text-small font-semibold",
              "text-text transition-colors duration-150",
              "hover:bg-action hover:text-text-inverse hover:border-action",
              "active:scale-95",
              "disabled:opacity-50 disabled:pointer-events-none"
            )}
          >
            {soldOut ? "Unavailable" : "Add to cart"}
          </button>
        </div>
      </div>

      {/* ── Info ────────────────────────────────────── */}
      <div className="mt-4 flex flex-1 flex-col gap-1.5">
        <h3 className="font-display text-product leading-snug line-clamp-2">
          <Link
            href={`/product/${product.slug}`}
            className="after:absolute after:inset-0 after:content-[''] hover:underline underline-offset-4 decoration-1"
          >
            {product.title}
          </Link>
        </h3>
        {product.weight_grams && (
          <p className="numeral text-small text-text-muted">{product.weight_grams}g</p>
        )}
        <div className="mt-auto pt-1">
          <Price amount={product.price} compareAt={product.compare_at_price} />
        </div>
      </div>
    </article>
  );
}
