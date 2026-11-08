import { ok } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { adminRoute } from "@/lib/admin/route";
import { statusSchema } from "@/lib/admin/schemas";
import { setProductStatus } from "@/lib/admin/catalogue";

export const dynamic = "force-dynamic";

/** draft | published | archived. Publication rules are enforced by the database. */
export const POST = adminRoute("admin.products.status", async (req, { db, params }) => {
  const { status, expectedVersion } = await readJson(req, statusSchema);
  return ok(await setProductStatus(db, params.id!, status, expectedVersion ?? null));
});
