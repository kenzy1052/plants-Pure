import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Product } from "@/lib/types";
import { toast } from "sonner";
import { formatGHS } from "@/lib/money";

/** Mirrors the server limit (create_checkout_order). The server re-validates stock regardless. */
const MAX_LINE_QUANTITY = 100;

interface CartState {
  items: { product: Product; quantity: number }[];
  isOpen: boolean;
  /** true once the saved cart has been read from this browser (never true during SSR) */
  hydrated: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getSubtotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      hydrated: false,
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      addItem: (product, quantity = 1) => {
        const currentItems = get().items;
        const existingIndex = currentItems.findIndex(
          (item) => item.product.id === product.id,
        );

        // Never mutate existing state objects (they are shared with the persisted copy).
        const clamp = (q: number) => Math.max(1, Math.min(q, MAX_LINE_QUANTITY, Math.max(1, product.stock ?? MAX_LINE_QUANTITY)));
        if (existingIndex > -1) {
          const updatedItems = currentItems.map((item, i) =>
            i === existingIndex ? { ...item, quantity: clamp(item.quantity + quantity) } : item,
          );
          set({ items: updatedItems, isOpen: true });
        } else {
          set({
            items: [...currentItems, { product, quantity: clamp(quantity) }],
            isOpen: true,
          });
        }

        toast.success(`Added ${product.title} to your cart`, {
          description: `${quantity} × ${formatGHS(product.price)}`,
        });
      },

      removeItem: (productId) => {
        set({ items: get().items.filter((i) => i.product.id !== productId) });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.product.id === productId
              ? { ...i, quantity: Math.min(Math.floor(quantity), MAX_LINE_QUANTITY, Math.max(1, i.product.stock ?? MAX_LINE_QUANTITY)) }
              : i,
          ),
        });
      },

      clearCart: () => set({ items: [] }),

      getSubtotal: () => {
        return get().items.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0,
        );
      },
    }),
    {
      name: "plants-pure-cart",
      // Only the items are saved. The drawer state must not survive a reload.
      partialize: (s) => ({ items: s.items }),
      // The saved cart is read after first paint (see CartHydrator) so the server HTML and the
      // first client render match; `hydrated` lets screens avoid flashing an "empty cart".
      skipHydration: true,
      onRehydrateStorage: () => () => useCartStore.setState({ hydrated: true }),
    },
  ),
);
