import { z } from "zod";

/** Shared by forms (client) and server functions: the same rules on both sides. */
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const checkoutSchema = z.object({
  clientRequestId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(100) })).min(1).max(50),
  zoneId: z.string().uuid(),
  customer: z.object({
    name: text(2, 120),
    phone: z.string().trim().regex(/^[0-9+()\-\s]{6,32}$/, "Enter a valid phone number"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
    address: text(5, 500),
    notes: z.string().trim().max(500).optional(),
  }),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const referenceSchema = z.object({ reference: z.string().trim().regex(/^PP-\d{1,10}-[0-9a-f]{12}$/, "Invalid reference") });

const oneLine = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min > 1 ? `Please enter at least ${min} characters.` : "This field is required.")
    .max(max, `Please keep this under ${max} characters.`)
    .refine((v) => !/[\r\n]/.test(v), "Please keep this on one line.");

export const contactSchema = z.object({
  clientRequestId: z.string().uuid(),
  name: oneLine(2, 120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  phone: z.string().trim().max(32).regex(/^[0-9+()\-\s]{6,32}$/, "Enter a valid phone number, or leave it blank.").or(z.literal("")).optional(),
  subject: oneLine(2, 150),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(2000, "Please keep your message under 2000 characters."),
  website: z.string().max(200).optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;
