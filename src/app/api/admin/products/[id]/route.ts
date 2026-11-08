import { ok } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { adminRoute } from "@/lib/admin/route";
import { updateProductSchema } from "@/lib/admin/schemas";
import { deleteProduct, saveProduct } from "@/lib/admin/catalogue";

export const dynamic = "force-dynamic";

/** Edit product content. `expectedVersion` makes a stale edit fail instead of overwriting. */
export const PATCH = adminRoute("admin.products.update", async (req, { db, params }) => {
  const { expectedVersion, ...data } = await readJson(req, updateProductSchema);
  return ok(await saveProduct(db, params.id!, expectedVersion ?? null, data));
});

/** Deleting is refused for live products and for any product that appears in an order; archive those instead. */
export const DELETE = adminRoute("admin.products.delete", async (_req, { db, params }) => {
  await deleteProduct(db, params.id!);
  return ok({ deleted: true });
});
