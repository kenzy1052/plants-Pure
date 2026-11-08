"use client";

import { useEffect } from "react";
import { useCartStore } from "@/context/cart-store";

/** Reads the saved cart from this browser once, after the first paint. Renders nothing. */
export function CartHydrator() {
  useEffect(() => {
    void useCartStore.persist.rehydrate();
  }, []);
  return null;
}
