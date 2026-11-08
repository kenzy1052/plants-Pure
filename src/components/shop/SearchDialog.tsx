import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { productsQuery, sanitizeSearch } from "@/lib/catalogue";
import { formatGHS } from "@/lib/money";
import { ProductImage } from "./ProductCard";

/** Live product search against the real catalogue (Supabase), with loading, empty and error states. */
export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(sanitizeSearch(term)), 220);
    return () => clearTimeout(t);
  }, [term]);
  const q = useQuery({ ...productsQuery({ q: debounced, pageSize: 6 }), enabled: open && debounced.length > 0 });

  const submit = () => {
    if (!debounced) return;
    onOpenChange(false);
    navigate({ to: "/shop", search: { q: debounced } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] max-w-2xl translate-y-0 gap-0 overflow-hidden rounded-3xl border-border bg-background p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Search products</DialogTitle>
        <DialogDescription className="sr-only">Type to search spices, herbs and oils.</DialogDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-3 border-b border-border px-5"
        >
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search spices, herbs, oils…"
            aria-label="Search products"
            className="h-16 flex-1 bg-transparent font-display text-xl outline-none placeholder:text-muted-foreground"
          />
          {q.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close search" className="rounded-full p-2 hover:bg-container">
            <X className="h-4 w-4" />
          </button>
        </form>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {!debounced && <p className="type-small px-3 py-6 text-muted-foreground">Start typing to search the catalogue.</p>}
          {debounced && q.isError && <p className="type-small px-3 py-6 text-destructive">Search isn't available right now. Please try again.</p>}
          {debounced && q.data && q.data.items.length === 0 && (
            <p className="type-small px-3 py-6 text-muted-foreground">No products match “{debounced}”.</p>
          )}
          {q.data?.items.map((p) => (
            <Link
              key={p.id}
              to="/product/$slug"
              params={{ slug: p.slug }}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-4 rounded-2xl p-3 transition-colors hover:bg-container"
            >
              <div className="h-14 w-12 overflow-hidden rounded-xl bg-container">
                <ProductImage src={p.images[0]?.url} alt={p.title} w={120} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="type-product truncate">{p.title}</p>
                {p.category && <p className="type-label text-muted-foreground">{p.category.name}</p>}
              </div>
              <span className="type-small tabular-nums">{formatGHS(p.price)}</span>
            </Link>
          ))}
          {q.data && q.data.total > q.data.items.length && (
            <button type="button" onClick={submit} className="type-small w-full rounded-2xl p-3 text-left text-pepper hover:bg-container">
              See all {q.data.total} results →
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
