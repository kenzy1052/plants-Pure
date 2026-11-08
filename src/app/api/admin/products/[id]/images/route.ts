import { ok } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { logger } from "@/lib/api/logger";
import { adminRoute } from "@/lib/admin/route";
import { imageActionSchema, imageRemoveSchema } from "@/lib/admin/schemas";
import { removeProductImage, reorderImages, setCoverImage, updateImageAlt } from "@/lib/admin/catalogue";
import { deleteAsset } from "@/lib/cloudinary/server";

export const dynamic = "force-dynamic";

/** Reorder, change the cover, or edit alt text. (Uploading goes through /api/uploads/*.) */
export const PATCH = adminRoute("admin.products.images.update", async (req, { db, params }) => {
  const input = await readJson(req, imageActionSchema);
  const images =
    input.action === "reorder"
      ? await reorderImages(db, params.id!, input.imageIds)
      : input.action === "cover"
        ? await setCoverImage(db, params.id!, input.imageId)
        : await updateImageAlt(db, input.imageId, input.altText);
  return ok({ images });
});

/**
 * Removes the database record FIRST. Only after that succeeds, and only if no other product
 * still uses the same Cloudinary asset, is the file deleted from Cloudinary. A failed
 * Cloudinary delete never fails the request (the record is already gone); it is reported
 * and logged so the file can be removed by hand.
 */
export const DELETE = adminRoute("admin.products.images.remove", async (req, { db }) => {
  const { imageId } = await readJson(req, imageRemoveSchema);
  const removed = await removeProductImage(db, imageId);
  let cloudinary: "deleted" | "kept" | "failed" = "kept";
  if (!removed.still_referenced) {
    try {
      await deleteAsset(removed.public_id);
      cloudinary = "deleted";
    } catch (e) {
      cloudinary = "failed";
      logger.warn("admin.image_cloudinary_delete_failed", { publicId: removed.public_id, message: String((e as Error)?.message ?? e) });
    }
  }
  return ok({ images: removed.images, cloudinary });
});
