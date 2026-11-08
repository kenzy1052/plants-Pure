import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import { formatGHS } from "./money";
import type { CartLine, Product } from "./types";

/** Mirrors the server limit (create_checkout_order). The server re-validates stock regardless. */
export const MAX_LINE_QUANTITY = 100;

interface CartState {
  lines: CartLine[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (product: Product, quantity?: number) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}

const clampQty = (q: number, stock: number) => Math.max(1, Math.min(Math.floor(q), MAX_LINE_QUANTITY, Math.max(1, stock)));

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      isOpen: false,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      add: (product, quantity = 1) => {
        if (product.stock <= 0) return;
        const lines = get().lines;
        const existing = lines.find((l) => l.productId === product.id);
        const next = existing
          ? lines.map((l) => (l.productId === product.id ? { ...l, stock: product.stock, price: product.price, quantity: clampQty(l.quantity + quantity, product.stock) } : l))
          : [
              ...lines,
              {
                productId: product.id,
                slug: product.slug,
                title: product.title,
                price: product.price,
                image: product.images[0]?.url ?? null,
                weightGrams: product.weight_grams,
                stock: product.stock,
                quantity: clampQty(quantity, product.stock),
              },
            ];
        set({ lines: next, isOpen: true });
        toast.success(`Added ${product.title}`, { description: `${quantity} × ${formatGHS(product.price)}` });
      },
      remove: (productId) => set({ lines: get().lines.filter((l) => l.productId !== productId) }),
      setQuantity: (productId, quantity) => {
        if (quantity <= 0) return get().remove(productId);
        set({ lines: get().lines.map((l) => (l.productId === productId ? { ...l, quantity: clampQty(quantity, l.stock) } : l)) });
      },
      clear: () => set({ lines: [] }),
    }),
    {
      name: "plants-pure-cart-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines }),
      skipHydration: true,
    },
  ),
);

export const cartSubtotal = (lines: CartLine[]) => lines.reduce((s, l) => s + l.price * l.quantity, 0);
export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.quantity, 0);
