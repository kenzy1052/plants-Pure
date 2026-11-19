import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Fail = { ok: false; error: string; code: string };

function fail(err: unknown, fallback: string): Fail {
  const e = err as { message?: string; code?: string; isPublic?: boolean } | null;
  if (e && e.isPublic) return { ok: false, error: e.message ?? fallback, code: e.code ?? "error" };
  console.error(fallback, err);
  return { ok: false, error: fallback, code: "error" };
}

const codeSchema = z.string().trim().min(6).max(40);

/** Footer "get updates" form. Honeypot field `website` must stay empty. */
export const subscribeToUpdates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(160),
        firstName: z.string().trim().max(40).optional(),
        source: z.string().trim().max(40).default("footer"),
        website: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; data: { status: "subscribed" | "already" | "resubscribed" } } | Fail> => {
    if (data.website && data.website.trim() !== "") return { ok: true, data: { status: "subscribed" } }; // bot: pretend success
    try {
      const { subscribeEmail } = await import("./server/growth.server");
      const res = await subscribeEmail({ email: data.email, firstName: data.firstName || undefined, source: data.source });
      return { ok: true, data: res };
    } catch (err) {
      return fail(err, "We couldn't sign you up just now. Please try again in a moment.");
    }
  });

export const unsubscribeFromUpdates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true; data: { found: boolean } } | Fail> => {
    try {
      const { unsubscribeByToken } = await import("./server/growth.server");
      return { ok: true, data: { found: await unsubscribeByToken(data.token) } };
    } catch (err) {
      return fail(err, "We couldn't update your subscription right now. Please try again.");
    }
  });

/** Can this order be reviewed yet (paid + delivered), and has it been already? */
export const getOrderReviewState = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: codeSchema }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true; data: { eligible: boolean; reviewed: boolean } } | Fail> => {
    try {
      const { getReviewState } = await import("./server/growth.server");
      const state = await getReviewState(data.code);
      if (!state) return { ok: false, error: "We couldn't find that order.", code: "not_found" };
      return { ok: true, data: state };
    } catch (err) {
      return fail(err, "We couldn't check this order right now.");
    }
  });

/** Customer rating after delivery. Saved as "pending" until an admin approves it. */
export const submitOrderReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: codeSchema,
        rating: z.number().int().min(1, "Please choose a star rating.").max(5),
        title: z.string().trim().max(80).optional(),
        body: z.string().trim().min(10, "Please tell us a little more (at least 10 characters).").max(800),
        website: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true } | Fail> => {
    if (data.website && data.website.trim() !== "") return { ok: true };
    try {
      const { submitReview } = await import("./server/growth.server");
      await submitReview({ code: data.code, rating: data.rating, title: data.title, body: data.body });
      return { ok: true };
    } catch (err) {
      return fail(err, "We couldn't save your review. Please try again.");
    }
  });
