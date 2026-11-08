import { ApiError, Errors } from "@/lib/api/errors";

type PgLike = { message?: string; details?: string | null; code?: string } | null | undefined;

/**
 * Translate the business-rule exceptions raised by our SQL functions
 * (RAISE EXCEPTION '<CODE>' USING ERRCODE='P0001') into safe, specific
 * customer-facing errors. Anything unrecognised is NOT forwarded.
 */
export function mapCheckoutDbError(error: PgLike): ApiError {
  const code = (error?.message ?? "").trim();
  const detail = error?.details ?? undefined;
  switch (code) {
    case "INVALID_ITEMS":
      return Errors.unprocessable("invalid_items", "Your cart is empty or contains an invalid item.");
    case "INVALID_CUSTOMER_DETAILS":
      return Errors.unprocessable("invalid_customer_details", "Please check your name, phone number, e-mail and delivery address.");
    case "PRODUCT_UNAVAILABLE":
      return Errors.conflict("product_unavailable", "One of the products in your cart is no longer available. Please review your cart.");
    case "INSUFFICIENT_STOCK": {
      const [productId, available] = (detail ?? "").split("|");
      return Errors.conflict("insufficient_stock", "Some items are no longer available in the quantity you requested.", {
        productId,
        available: Number(available ?? 0),
      });
    }
    case "DELIVERY_ZONE_INVALID":
      return Errors.unprocessable("delivery_zone_invalid", "Please choose a valid delivery option.");
    case "IDEMPOTENCY_KEY_CONFLICT":
      return Errors.conflict("duplicate_request", "This checkout was already submitted. Please refresh and try again.");
    case "PAYMENT_INIT_IN_PROGRESS":
      return Errors.conflict("payment_in_progress", "Your payment is already being set up. Please wait a few seconds and try again.");
    case "ORDER_NOT_PAYABLE":
      return Errors.conflict("order_not_payable", "This order can no longer be paid. Please start a new checkout.");
    default:
      return Errors.upstream();
  }
}
