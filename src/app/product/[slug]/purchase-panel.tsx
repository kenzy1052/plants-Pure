"use client";

import { useState } from "react";
import { useCartStore } from "@/context/cart-store";
import { formatGHS } from "@/lib/money";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";

const MAX_PER_LINE = 100; // mirrors the server limit; the server re-validates stock regardless

/** Quantity + Add to cart. Uses the existing cart store; limits follow the stock the database reported. */
export function PurchasePanel({ product }: { product: Product }) {
  const addItem = useCartStore((s) => s.addItem);
  const [quantity, setQuantity] = useState(1);
  const soldOut = product.stock <= 0;
  const max = Math.max(1, Math.min(product.stock, MAX_PER_LINE));

  if (soldOut) {
    return (
      <div className="mt-8">
        <Button variant="primary" size="lg" disabled className="w-full sm:w-auto">
          Currently unavailable
        </Button>
        <p className="mt-3 text-small text-text-secondary">This product is sold out at the moment. Contact us to ask when it will be back.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <QuantityStepper value={quantity} onChange={setQuantity} max={max} label={`Quantity of ${product.title}`} />
        <Button variant="accent" size="lg" className="sm:flex-1" onClick={() => addItem(product, quantity)}>
          Add to cart · <span className="numeral">{formatGHS(product.price * quantity)}</span>
        </Button>
      </div>
      <p className="mt-3 text-small text-text-muted">Delivery is calculated at checkout. Final price and availability are confirmed when you pay.</p>
    </div>
  );
}
