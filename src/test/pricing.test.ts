import { describe, expect, it } from "vitest";
import { deliveryFeeFor } from "@/lib/catalogue";
import { toMinorUnits } from "@/lib/money";
import type { DeliveryZone } from "@/lib/types";

const zone = (over: Partial<DeliveryZone>): DeliveryZone => ({ id: "z", name: "Zone", fee: 30, free_over: null, is_pickup: false, notes: null, ...over });

describe("delivery fee (mirrors create_checkout_order)", () => {
  it("charges the zone fee below the free-delivery threshold", () => {
    expect(deliveryFeeFor(zone({ fee: 30, free_over: 300 }), 299.99)).toBe(30);
  });
  it("is free at or above the threshold", () => {
    expect(deliveryFeeFor(zone({ fee: 30, free_over: 300 }), 300)).toBe(0);
  });
  it("uses the zone's own fee for pickup zones", () => {
    expect(deliveryFeeFor(zone({ fee: 0, is_pickup: true }), 50)).toBe(0);
  });
});

describe("Paystack amounts", () => {
  it("converts cedis to pesewas exactly", () => {
    expect(toMinorUnits("200.00")).toBe(20000);
    expect(toMinorUnits(12.5)).toBe(1250);
  });
});
