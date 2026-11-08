import { z } from "zod";
import { ok, Errors } from "@/lib/api/errors";
import { readJson } from "@/lib/api/request";
import { adminRoute } from "@/lib/admin/route";
import { addProductImage } from "@/lib/admin/catalogue";
import { ALLOWED_FORMATS, MAX_IMAGE_BYTES, UNCONFIRMED_TAG, confirmAssetTag, deleteAsset, fetchAsset } from "@/lib/cloudinary/server";
import { isValidPublicId } from "@/lib/cloudinary/delivery";
import { requireFeature } from "@/lib/env/server";
import { logger } from "@/lib/api/logger";
import { ApiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  productId: z.string().uuid(),
  publicId: z.string().max(200).refine(isValidPublicId, "Invalid image id").refine((v) => v.startsWith("plants-and-pure/products/"), "Not a product image"),
  altText: z.string().trim().max(200).optional(),
});

/** Failures that mean "this upload can never be attached": the file is then removed from Cloudinary. */
const UNATTACHABLE = new Set(["not_found", "product_archived", "invalid_input", "invalid_value"]);

/**
 * After the browser uploads, the server does NOT trust what the browser says about the file.
 * It asks Cloudinary for the asset's real format, size, address and tag, deletes it if it
 * breaks the rules, and only then records it on the product — through the admin function, as
 * the signed-in admin, so ordering/cover/audit rules are applied in one transaction.
 */
export const POST = adminRoute(
  "uploads.confirm",
  async (req, { db }) => {
    const body = await readJson(req, schema);

    const asset = await fetchAsset(body.publicId);
    if (!asset) throw Errors.notFound("That image was not found. Upload it again.");

    const formatOk = (ALLOWED_FORMATS as readonly string[]).includes(asset.format.toLowerCase());
    if (!formatOk || asset.bytes > MAX_IMAGE_BYTES) {
      await deleteAsset(body.publicId).catch((e) => logger.warn("uploads.reject_cleanup_failed", { publicId: body.publicId, message: String(e?.message ?? e) }));
      throw Errors.unprocessable("image_rejected", `Images must be JPG, PNG or WebP and at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
    }

    // The address we store must be on OUR Cloudinary account, and the asset must be a fresh upload
    // (still tagged "unconfirmed"): an existing asset cannot be re-attached by guessing its id.
    const cloud = requireFeature("cloudinary").cloudinary.cloudName!;
    if (!asset.secure_url.startsWith(`https://res.cloudinary.com/${cloud}/`)) {
      throw Errors.unprocessable("image_rejected", "That image is not on this store's media account.");
    }
    if (!asset.tags?.includes(UNCONFIRMED_TAG)) {
      throw Errors.conflict("image_not_new", "That image was not just uploaded. Upload it again.");
    }

    let images;
    try {
      images = await addProductImage(db, {
        productId: body.productId,
        publicId: asset.public_id,
        url: asset.secure_url,
        alt: body.altText ?? null,
        width: asset.width,
        height: asset.height,
        bytes: asset.bytes,
        format: asset.format.toLowerCase(),
      });
    } catch (e) {
      // Keep the file when the failure may be temporary or the image is already in use; remove it when it can never be attached.
      if (e instanceof ApiError && UNATTACHABLE.has(e.code)) {
        await deleteAsset(asset.public_id).catch((err) => logger.warn("uploads.attach_cleanup_failed", { publicId: asset.public_id, message: String(err?.message ?? err) }));
      }
      throw e;
    }

    await confirmAssetTag(asset.public_id).catch((e) => logger.warn("uploads.untag_failed", { publicId: asset.public_id, message: String(e?.message ?? e) }));
    return ok({ images }, { status: 201 });
  },
  { max: 60 },
);
