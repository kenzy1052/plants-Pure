import { ok } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { adminRoute } from "@/lib/admin/route";
import { createProductSchema, slugify } from "@/lib/admin/schemas";
import { saveProduct } from "@/lib/admin/catalogue";
import { Errors } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/** Create a DRAFT product. Publication is a separate, validated step. */
export const POST = adminRoute("admin.products.create", async (req, { db }) => {
  const input = await readJson(req, createProductSchema);
  const slug = input.slug ?? slugify(input.title);
  if (slug.length < 2) throw Errors.unprocessable("validation_failed", "Enter a name with letters or numbers.", { title: ["Enter a name with letters or numbers."] });
  const product = await saveProduct(db, null, null, { ...input, slug });
  return ok(product, { status: 201 });
});
