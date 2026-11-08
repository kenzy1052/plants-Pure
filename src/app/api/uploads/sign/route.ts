import { z } from "zod";
import { ok, route } from "@/lib/api/errors";
import { assertSameOrigin, readJson } from "@/lib/api/request";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { requireRole } from "@/lib/api/auth";
import { createUploadSignature } from "@/lib/cloudinary/server";

export const dynamic = "force-dynamic";

const schema = z.object({ folder: z.string().max(100).default("plants-and-pure/products") });

/** Admin-only. Returns a short-lived signature for a direct browser→Cloudinary upload. */
export const POST = route("uploads.sign", async (req: Request) => {
  assertSameOrigin(req);
  enforceRateLimit(req, "uploads.sign", { max: 30, windowMs: 60_000 });
  const user = await requireRole(["admin"]);
  const { folder } = await readJson(req, schema);
  enforceRateLimit(req, "uploads.sign.user", { max: 60, windowMs: 60 * 60_000 }, user.id);
  return ok(createUploadSignature(folder));
});
