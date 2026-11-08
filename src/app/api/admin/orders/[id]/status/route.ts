import { ok } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { adminRoute } from "@/lib/admin/route";
import { updateFulfillmentStatus } from "@/lib/admin/orders";
import { z } from "zod";

export const dynamic = "force-dynamic";

const FULFILLMENT_STATUSES = ["unfulfilled", "processing", "dispatched", "delivered", "on_hold"] as const;
const statusSchema = z.object({
  fulfillment_status: z.enum(FULFILLMENT_STATUSES),
});

/** POST /api/admin/orders/[id]/status — update fulfillment status. */
export const POST = adminRoute("admin.orders.fulfillment", async (req, { db, params }) => {
  const input = await readJson(req, statusSchema);
  return ok(await updateFulfillmentStatus(db, params.id!, input.fulfillment_status));
});
