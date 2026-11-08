import { z } from "zod";

/** Shared by the form (client) and the API route (server): the same rules on both sides. */
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
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail address.").max(254),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[0-9+()\-\s]{6,32}$/, "Enter a valid phone number, or leave it blank.")
    .or(z.literal(""))
    .optional(),
  subject: oneLine(2, 150),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(2000, "Please keep your message under 2000 characters."),
  /** Honeypot: real visitors never see or fill this. */
  website: z.string().max(200).optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;
