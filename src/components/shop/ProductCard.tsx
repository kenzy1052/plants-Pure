import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { cldUrl } from "@/lib/catalogue";
import { companyPhotoFor } from "@/assets/company";
import { useCart } from "@/lib/cart-store";
import { formatGHS } from "@/lib/money";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Price({ price, compareAt, className }: { price: number; compareAt?: number | null; className?: string }) {
  const onSale = typeof compareAt === "number" && compareAt > price;
  return (
    <span className={cn("inline-flex items-baseline gap-2 tabular-nums", className)}>
      <span>{formatGHS(price)}</span>
      {onSale && <s className="text-[0.85em] font-normal text-muted-foreground">{formatGHS(compareAt!)}</s>}
    </span>
  );
}

export function ProductImage({ src, alt, className, w = 700, priority = false, square = false, fit = false }: { src: string | null | undefined; alt: string; className?: string; w?: number; priority?: boolean; square?: boolean; fit?: boolean }) {
  const [broken, setBroken] = useState(false);
  const url = !broken ? (fit ? cldUrl(src, w, { crop: "fit" }) : cldUrl(src, w, { h: square ? w : Math.round(w * 1.25) })) : null;
  if (url) {
    return <img src={url} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setBroken(true)} className={cn("h-full w-full object-cover", className)} />;
  }
  // No database image yet: use the company's own studio photo for this product when we have one.
  const own = companyPhotoFor(alt);
  if (own) {
    return <img src={own} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" className={cn("h-full w-full bg-night object-cover", className)} />;
  }
  return <img src="/product-placeholder.svg" alt="" className={cn("h-full w-full object-cover", className)} />;
}

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const add = useCart((s) => s.add);
  const soldOut = product.stock <= 0;
  const onSale = product.compare_at_price != null && product.compare_at_price > product.price;
  const lowStock = !soldOut && product.stock <= 5;
  const image = product.images[0];
  const meta = [product.weight_grams ? `${product.weight_grams} g` : null, lowStock ? `Only ${product.stock} left` : null].filter(Boolean).join(" · ");
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-border bg-surface transition-[box-shadow,transform,border-color] duration-500 ease-[var(--ease-settle)] focus-within:ring-2 focus-within:ring-ring hover:-translate-y-1 hover:border-pepper/30 hover:shadow-lift">
      <div className="relative aspect-square overflow-hidden bg-container">
        <ProductImage src={image?.url} alt={image?.alt || product.title} priority={priority} w={600} square className={cn("transition-transform duration-[900ms] ease-[var(--ease-settle)] group-hover:scale-[1.06]", soldOut && "opacity-60 grayscale-[30%]")} />
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
          {soldOut && <span className="type-label rounded-full bg-surface px-2 py-0.5 text-foreground">Sold out</span>}
          {onSale && !soldOut && <span className="type-label rounded-full bg-brand-gradient px-2 py-0.5 text-pepper-foreground">Sale</span>}
          {product.is_featured && !soldOut && <span className="type-label rounded-full bg-lime-gradient px-2 py-0.5 text-lime-foreground">Bestseller</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        <h3 className="type-product truncate">
          {/* Stretched link: the whole card opens the product page (description, price, details). */}
          <Link to="/product/$slug" params={{ slug: product.slug }} title={product.title} className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-brand focus-visible:outline-none">
            {product.title}
          </Link>
        </h3>
        {(product.tagline || meta) && (
          <p className="type-small mt-0.5 truncate text-muted-foreground">{product.tagline || meta}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <Price price={product.price} compareAt={product.compare_at_price} className="type-body font-bold" />
          <button
            type="button"
            disabled={soldOut}
            onClick={() => add(product, 1)}
            aria-label={soldOut ? `${product.title} is sold out` : `Add ${product.title} to cart`}
            className="relative z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-primary-foreground transition-[filter,transform] hover:brightness-110 active:scale-95 disabled:bg-none disabled:bg-container disabled:text-muted-foreground"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="sr-only">{soldOut ? "Sold out" : "Add to cart"}</span>
          </button>
        </div>
      </div>
    </article>
  );
}