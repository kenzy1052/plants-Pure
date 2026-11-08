import { ok } from "@/lib/api/errors";
import { adminRoute } from "@/lib/admin/route";
import { getOrder } from "@/lib/admin/orders";

export const dynamic = "force-dynamic";

/** GET /api/admin/orders/[id] — full order detail. */
export const GET = adminRoute("admin.orders.detail", async (_req, { db, params }) => {
  return ok(await getOrder(db, params.id!));
});
