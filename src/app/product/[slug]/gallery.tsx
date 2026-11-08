"use client";

import { useState } from "react";
import Image from "next/image";
import { PRODUCT_PLACEHOLDER } from "@/lib/catalogue/images";
import type { ProductImage } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Image gallery. A broken or slow image falls back to the neutral placeholder; the frame never changes size. */
export function ProductGallery({ title, images, soldOut }: { title: string; images: ProductImage[]; soldOut: boolean }) {
  const [selected, setSelected] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const usable = images.filter((i) => !broken.has(i.url));
  const list: ProductImage[] = usable.length ? usable : [{ url: PRODUCT_PLACEHOLDER, alt: null }];
  const index = Math.min(selected, list.length - 1);
  const current = list[index]!;
  const markBroken = (url: string) => setBroken((s) => new Set(s).add(url));

  return (
    <div>
      <div className="relative aspect-4/5 w-full overflow-hidden bg-background-alt">
        <Image
          key={current.url}
          src={current.url}
          alt={current.alt ?? `${title}${list.length > 1 ? `, image ${index + 1} of ${list.length}` : ""}`}
          fill
          priority
          sizes="(min-width: 1024px) 52vw, 100vw"
          onError={() => markBroken(current.url)}
          className={cn("object-cover", soldOut && "opacity-70")}
        />
      </div>
      {list.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto" aria-label="Product images">
          {list.map((img, i) => (
            <li key={img.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`Show image ${i + 1} of ${list.length}`}
                aria-current={i === index ? "true" : undefined}
                className={cn("relative block size-16 overflow-hidden border-2 bg-background-alt md:size-20", i === index ? "border-text" : "border-transparent hover:border-border-strong")}
              >
                <Image src={img.url} alt="" fill sizes="80px" onError={() => markBroken(img.url)} className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
