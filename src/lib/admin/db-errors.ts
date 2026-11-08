import { ApiError, Errors } from "@/lib/api/errors";
import { PUBLICATION_MESSAGES } from "@/lib/admin/schemas";

type PgLike = { message?: string; details?: string | null; code?: string; hint?: string | null } | null | undefined;

const CONSTRAINT = /"([^"]+)"/;

/** Field + plain-language reason for the CHECK constraints an administrator can trip. */
const CHECKS: Record<string, [field: string, message: string]> = {
  products_price_nonneg: ["price", "Price cannot be negative."],
  products_price_max: ["price", "Price is too large."],
  products_compare_at_gt_price: ["compare_at_price", "The original price must be higher than the selling price."],
  products_stock_nonneg: ["stock", "Stock cannot be negative."],
  products_stock_max: ["stock", "Stock is too large."],
  products_weight_positive: ["weight_grams", "Weight must be above 0."],
  products_title_not_blank: ["title", "Enter a product name."],
  products_slug_format: ["slug", "Use lowercase letters, numbers and single hyphens."],
  products_low_stock_nonneg: ["low_stock_threshold", "The low-stock level cannot be negative."],
  categories_slug_format: ["slug", "Use lowercase letters, numbers and single hyphens."],
  categories_name_not_blank: ["name", "Enter a category name."],
  product_images_url_is_cloudinary: ["image", "That image address is not accepted."],
  product_images_public_id_format: ["image", "That image id is not accepted."],
};

/**
 * Turns what Postgres/PostgREST says into a safe, specific API error. Business-rule
 * exceptions are RAISE EXCEPTION '<CODE>' from the admin_* functions; constraint failures
 * come through as SQLSTATE 23xxx with the constraint name. Anything unrecognised is NOT
 * forwarded to the caller.
 */
export function mapAdminDbError(error: PgLike): ApiError {
  const code = (error?.message ?? "").trim();
  const detail = error?.details ?? "";
  const sqlstate = error?.code ?? "";

  switch (code) {
    case "FORBIDDEN":
      return Errors.forbidden();
    case "NOT_FOUND":
      return Errors.notFound("That item no longer exists. Refresh the page.");
    case "STALE_PRODUCT":
      return Errors.conflict("stale_product", "Someone else changed this product while you were editing. Reload the page to see the latest version, then re-apply your change.");
    case "SLUG_LOCKED":
      return Errors.conflict("slug_locked", "The web address of a published product cannot change (it would break existing links). Unpublish it first if you really must.");
    case "PRODUCT_ARCHIVED":
      return Errors.conflict("product_archived", "This product is archived. Restore it to a draft before editing or publishing.");
    case "PRODUCT_HAS_ORDERS":
      return Errors.conflict("product_has_orders", "This product appears in orders and cannot be deleted. Archive it instead.");
    case "PRODUCT_PUBLISHED":
      return Errors.conflict("product_published", "Unpublish or archive the product before deleting it.");
    case "CATEGORY_IN_USE":
      return Errors.conflict("category_in_use", "Products still use this category. Move or archive them first, or deactivate the category once nothing live is in it.");
    case "PUBLICATION_REQUIREMENTS": {
      const problems = detail.split("|").filter(Boolean);
      return Errors.unprocessable("publication_requirements", "This product cannot be published yet.", {
        problems,
        messages: problems.map((p) => PUBLICATION_MESSAGES[p] ?? p),
      });
    }
    case "INVALID_STOCK":
      return Errors.unprocessable("invalid_stock", /cannot remove/.test(detail) ? `Not enough stock: ${detail.replace(/^stock is /, "there are only ").replace(", cannot remove", " and you tried to remove")}.` : "That stock quantity is not allowed.");
    case "INVALID_INPUT":
      return Errors.unprocessable("invalid_input", "Some values are not valid.", detail ? { reason: detail } : undefined);
  }

  const constraint = CONSTRAINT.exec(error?.message ?? "")?.[1];
  if (sqlstate === "23505") {
    if (constraint === "products_slug_key") return Errors.conflict("slug_taken", "Another product already uses that web address.", { field: "slug" });
    if (constraint === "products_sku_key" || constraint === "products_sku_ci_key") return Errors.conflict("sku_taken", "Another product already uses that SKU.", { field: "sku" });
    if (constraint === "categories_slug_key") return Errors.conflict("slug_taken", "Another category already uses that web address.", { field: "slug" });
    if (constraint === "categories_name_ci_key") return Errors.conflict("name_taken", "A category with that name already exists.", { field: "name" });
    if (constraint === "product_images_unique_asset") return Errors.conflict("duplicate_image", "That image is already attached to this product.");
    if (constraint === "product_images_one_cover_per_product") return Errors.conflict("cover_conflict", "The product already has a cover image.");
    return Errors.conflict("duplicate", "That value is already in use.");
  }
  if (sqlstate === "23514" && constraint && CHECKS[constraint]) {
    const [field, message] = CHECKS[constraint]!;
    return Errors.unprocessable("invalid_value", message, { field });
  }
  if (sqlstate === "23514") return Errors.unprocessable("invalid_value", "One of the values is not allowed.");
  if (sqlstate === "23502") return Errors.unprocessable("required_field", "A required field is missing.");
  if (sqlstate === "23503") {
    if (constraint === "products_category_id_fkey") return Errors.unprocessable("category_not_found", "That category does not exist.", { field: "category_id" });
    return Errors.conflict("in_use", "That item is still referenced elsewhere.");
  }
  if (sqlstate === "42501") return Errors.forbidden();
  return Errors.upstream();
}
