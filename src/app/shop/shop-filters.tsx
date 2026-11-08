"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { cn } from "@/lib/utils";

export type FilterLink = { key: string; label: string; href: string; active: boolean; count?: number };

/**
 * Category + sort controls. All links are computed on the server from the URL, so this component
 * holds no filter state of its own:
 *  - md and up: category chips and a sort menu inline.
 *  - below md: one "Filters" button opens a sheet with the same links (touch-sized rows).
 */
export function ShopFilters({ categories, sorts, activeCount, clearHref }: { categories: FilterLink[]; sorts: FilterLink[]; activeCount: number; clearHref: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const activeSort = sorts.find((s) => s.active) ?? sorts[0];

  const chip = "inline-flex h-11 items-center rounded-pill border px-5 text-small font-semibold transition-colors duration-(--duration-fast)";
  const row = "flex min-h-12 items-center justify-between border-b border-border px-1 py-2 text-body";

  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden items-start justify-between gap-6 md:flex">
        {categories.length > 0 ? (
          <nav aria-label="Categories">
            <ul className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <li key={c.key}>
                  <Link href={c.href} aria-current={c.active ? "true" : undefined} className={cn(chip, c.active ? "border-action bg-action text-text-inverse" : "border-border-strong hover:border-text")}>
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-3">
          <label htmlFor="sort-select" className="text-small font-semibold">
            Sort by
          </label>
          <Select id="sort-select" value={activeSort?.key} onChange={(e) => router.push(sorts.find((s) => s.key === e.target.value)?.href ?? "/shop")} className="w-52">
            {sorts.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex items-center justify-between gap-3 md:hidden">
        <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filter &amp; sort{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
        {clearHref && (
          <Link href={clearHref} className="text-small font-semibold underline underline-offset-4">
            Clear all
          </Link>
        )}
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title="Filter and sort" side="right">
        <div className="flex h-full flex-col overflow-y-auto px-(--gutter) pb-8">
          {categories.length > 0 && (
            <section aria-labelledby="mobile-cat" className="mt-2">
              <h3 id="mobile-cat" className="eyebrow mb-1 text-text-muted">
                Category
              </h3>
              <ul>
                {categories.map((c) => (
                  <li key={c.key}>
                    <Link href={c.href} onClick={() => setOpen(false)} aria-current={c.active ? "true" : undefined} className={cn(row, c.active && "font-semibold")}>
                      <span>{c.label}</span>
                      <span className="flex items-center gap-3 text-small text-text-muted">
                        {typeof c.count === "number" && <span className="numeral">{c.count}</span>}
                        {c.active && <span>Selected</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="mobile-sort" className="mt-8">
            <h3 id="mobile-sort" className="eyebrow mb-1 text-text-muted">
              Sort by
            </h3>
            <ul>
              {sorts.map((s) => (
                <li key={s.key}>
                  <Link href={s.href} onClick={() => setOpen(false)} aria-current={s.active ? "true" : undefined} className={cn(row, s.active && "font-semibold")}>
                    <span>{s.label}</span>
                    {s.active && <span className="text-small text-text-muted">Selected</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {clearHref && (
            <Link href={clearHref} onClick={() => setOpen(false)} className="mt-8 text-small font-semibold underline underline-offset-4">
              Clear search and filters
            </Link>
          )}
        </div>
      </Drawer>
    </>
  );
}
