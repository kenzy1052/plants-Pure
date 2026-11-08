import { ok } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { adminRoute } from "@/lib/admin/route";
import { stockSchema } from "@/lib/admin/schemas";
import { adjustStock, setStock } from "@/lib/admin/catalogue";

export const dynamic = "force-dynamic";

/**
 * Stock is only ever changed here (or by a verified payment). `adjust` is a relative
 * change under a row lock; `set` is a stocktake. Both are written to the ledger.
 */
export const POST = adminRoute("admin.products.stock", async (req, { db, params }) => {
  const input = await readJson(req, stockSchema);
  const result =
    input.mode === "adjust"
      ? await adjustStock(db, params.id!, input.delta, input.reason, input.note ?? null)
      : await setStock(db, params.id!, input.quantity, input.note ?? null);
  return ok(result);
});
