import { ok } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { adminRoute } from "@/lib/admin/route";
import { categoryUpdateSchema } from "@/lib/admin/schemas";
import { deleteCategory, saveCategory } from "@/lib/admin/catalogue";

export const dynamic = "force-dynamic";

export const PATCH = adminRoute("admin.categories.update", async (req, { db, params }) => {
  const input = await readJson(req, categoryUpdateSchema);
  return ok(await saveCategory(db, params.id!, input));
});

/** Only an unused category can be deleted; otherwise deactivate it. */
export const DELETE = adminRoute("admin.categories.delete", async (_req, { db, params }) => {
  await deleteCategory(db, params.id!);
  return ok({ deleted: true });
});
