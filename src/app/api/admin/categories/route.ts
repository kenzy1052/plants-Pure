import { ok, Errors } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { adminRoute } from "@/lib/admin/route";
import { categorySchema, slugify } from "@/lib/admin/schemas";
import { saveCategory } from "@/lib/admin/catalogue";

export const dynamic = "force-dynamic";

export const POST = adminRoute("admin.categories.create", async (req, { db }) => {
  const input = await readJson(req, categorySchema);
  const slug = input.slug ?? slugify(input.name);
  if (slug.length < 2) throw Errors.unprocessable("validation_failed", "Enter a name with letters or numbers.", { name: ["Enter a name with letters or numbers."] });
  return ok(await saveCategory(db, null, { ...input, slug }), { status: 201 });
});
