import { ok } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { adminRoute } from "@/lib/admin/route";
import { listOrders } from "@/lib/admin/orders";
import { z } from "zod";

export const dynamic = "force-dynamic";

const listSchema = z.object({
  payment_status:     z.string().optional(),
  fulfillment_status: z.string().optional(),
  q:                  z.string().optional(),
  page:               z.coerce.number().int().positive().optional(),
  page_size:          z.coerce.number().int().min(5).max(100).optional(),
});

/** GET /api/admin/orders — paginated order list with status filters. */
export const GET = adminRoute("admin.orders.list", async (_req, { db }) => {
  const url = new URL(_req.url);
  const raw = {
    payment_status:     url.searchParams.get("payment_status")     ?? undefined,
    fulfillment_status: url.searchParams.get("fulfillment_status") ?? undefined,
    q:                  url.searchParams.get("q")                  ?? undefined,
    page:               url.searchParams.get("page")               ?? undefined,
    page_size:          url.searchParams.get("page_size")          ?? undefined,
  };
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) {
    return ok({ ok: false, error: { code: "validation_failed", message: "Invalid parameters." } }, { status: 400 });
  }
  return ok(await listOrders(db, parsed.data));
});
