/**
 * Validation for the product-management API and forms. Client-safe (no secrets, no
 * server-only imports): the same rules run in the browser for fast feedback and on the
 * server, which is the one that counts. The database enforces them a third time.
 */
import { z } from "zod";

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
export const MAX_PRICE = 1_000_000;
export const MAX_STOCK = 1_000_000;

/** "Turmeric Powder (100 g)" -> "turmeric-powder-100-g" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const oneLine = (max: number, min = 0) =>
  z
    .string()
    .trim()
    .min(min, min ? `Enter at least ${min} characters.` : undefined)
    .max(max, `Use at most ${max} characters.`)
    .refine((v) => !/[\r\n]/.test(v), "Use a single line.");

const optionalText = (max: number, lines = false) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .refine((v) => lines || !/[\r\n]/.test(v), "Use a single line.")
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v));

const cedis = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .min(0, `${label} cannot be negative.`)
    .max(MAX_PRICE, `${label} is too large.`)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${label} can have at most two decimal places.`);

const baseProduct = {
  title: oneLine(120, 2),
  slug: z.string().trim().min(2, "Enter a web address.").max(80).regex(SLUG_RE, "Use lowercase letters, numbers and single hyphens."),
  tagline: optionalText(160),
  description: z.string().trim().max(4000, "Use at most 4000 characters."),
  flavor_notes: z.array(oneLine(60, 1)).max(12, "At most 12 flavour notes.").optional(),
  culinary_uses: optionalText(1000, true),
  ingredients: optionalText(1000, true),
  price: cedis("Price"),
  compare_at_price: cedis("Original price").nullable().optional(),
  weight_grams: z.number().int("Weight must be a whole number of grams.").min(1).max(100_000).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  is_featured: z.boolean().optional(),
  // A blank SKU field means "no SKU": normalise first, then validate what remains.
  sku: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().regex(SKU_RE, "Letters, numbers, dots, hyphens and underscores only (max 40).").nullable().optional(),
  ),
  low_stock_threshold: z.number().int().min(0).max(100_000).nullable().optional(),
};

function comparePriceRule<T extends { price?: number; compare_at_price?: number | null }>(v: T, ctx: z.RefinementCtx) {
  if (v.compare_at_price != null && v.price != null && v.compare_at_price <= v.price) {
    ctx.addIssue({ code: "custom", path: ["compare_at_price"], message: "The original price must be higher than the selling price (or leave it empty)." });
  }
}

/** Create: a title is required; everything else can wait until the product is published. */
export const createProductSchema = z
  .object({
    ...baseProduct,
    slug: baseProduct.slug.optional(), // derived from the title when empty
    description: baseProduct.description.optional(),
    price: baseProduct.price.optional(),
    stock: z.number().int("Stock must be a whole number.").min(0).max(MAX_STOCK).optional(),
  })
  .strict()
  .superRefine(comparePriceRule);

/** Edit: any subset of the content fields. Stock and publication have their own endpoints. */
export const updateProductSchema = z
  .object(baseProduct)
  .partial()
  .extend({ expectedVersion: z.number().int().min(1).optional() })
  .strict()
  .superRefine(comparePriceRule);

export const statusSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
  expectedVersion: z.number().int().min(1).optional(),
}).strict();

export const STOCK_REASONS = ["restock", "adjustment", "return", "correction"] as const;
export const stockSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("adjust"),
    delta: z.number().int("Enter a whole number.").refine((n) => n !== 0, "Enter a change other than 0.").refine((n) => Math.abs(n) <= 100_000, "Too large."),
    reason: z.enum(STOCK_REASONS),
    note: optionalText(300),
  }).strict(),
  z.object({
    mode: z.literal("set"),
    quantity: z.number().int("Enter a whole number.").min(0, "Stock cannot be negative.").max(MAX_STOCK),
    note: optionalText(300),
  }).strict(),
]);

export const categorySchema = z.object({
  name: oneLine(60, 2),
  slug: z.string().trim().min(2).max(60).regex(SLUG_RE, "Use lowercase letters, numbers and single hyphens.").optional(),
  description: optionalText(500, true),
  display_order: z.number().int().min(0).max(1000).optional(),
  is_active: z.boolean().optional(),
}).strict();
export const categoryUpdateSchema = categorySchema.partial().strict();

export const imageActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reorder"), imageIds: z.array(z.string().uuid()).min(1).max(100) }).strict(),
  z.object({ action: z.literal("cover"), imageId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("alt"), imageId: z.string().uuid(), altText: z.string().trim().max(200, "Use at most 200 characters.") }).strict(),
]);
export const imageRemoveSchema = z.object({ imageId: z.string().uuid() }).strict();

export const idParam = z.string().uuid();

/** What is blocking publication, in words an administrator can act on. */
export const PUBLICATION_MESSAGES: Record<string, string> = {
  title_missing: "Add a product name.",
  slug_missing: "Add a web address (slug).",
  description_missing: "Add a description (at least 10 characters).",
  price_invalid: "Set a selling price above GH₵ 0.",
  category_missing: "Choose a category.",
  category_inactive: "The chosen category is inactive. Choose an active one or reactivate it.",
  image_missing: "Upload at least one product image.",
  cover_missing: "Choose a cover image.",
};

export const STATUS_LABEL = { draft: "Draft", published: "Published", archived: "Archived" } as const;
export type ProductStatus = keyof typeof STATUS_LABEL;
