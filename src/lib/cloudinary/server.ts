import "server-only";
import crypto from "node:crypto";
import { requireFeature } from "@/lib/env/server";
import { Errors } from "@/lib/api/errors";
import { isValidPublicId } from "@/lib/cloudinary/delivery";

/** Folders an upload may target. Anything else is refused. */
export const UPLOAD_FOLDERS = ["plants-and-pure/products", "plants-and-pure/categories", "plants-and-pure/site"] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];
export const ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const UNCONFIRMED_TAG = "unconfirmed";

/**
 * Cloudinary signature: SHA-1 over "k=v&k=v" of the params sorted by key
 * (file, cloud_name, resource_type and api_key are excluded) with the API secret appended.
 */
export function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((k) => !["file", "cloud_name", "resource_type", "api_key"].includes(k) && params[k] !== "" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

export function isAllowedFolder(folder: string): folder is UploadFolder {
  return (UPLOAD_FOLDERS as readonly string[]).includes(folder);
}

/**
 * Parameters for ONE signed direct-to-Cloudinary upload. The signature binds the
 * folder, the allowed formats and the "unconfirmed" tag, so the browser cannot
 * change them (a changed value invalidates the signature). The tag lets us find
 * and delete uploads that were never attached to a product (orphans).
 */
export function createUploadSignature(folder: string, now = Math.floor(Date.now() / 1000)) {
  if (!isAllowedFolder(folder)) throw Errors.badRequest("That upload folder is not allowed.");
  const env = requireFeature("cloudinary").cloudinary;
  const signed = { allowed_formats: ALLOWED_FORMATS.join(","), folder, tags: UNCONFIRMED_TAG, timestamp: now };
  return {
    cloudName: env.cloudName!,
    apiKey: env.apiKey!,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudName}/image/upload`,
    signature: signCloudinaryParams(signed, env.apiSecret!),
    params: signed,
    maxBytes: MAX_IMAGE_BYTES,
  };
}

let fetchImpl: typeof fetch = (...a) => fetch(...a);
export function __setCloudinaryFetchForTests(f: typeof fetch | undefined) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

function basicAuth() {
  const e = requireFeature("cloudinary").cloudinary;
  return { cloud: e.cloudName!, header: `Basic ${Buffer.from(`${e.apiKey}:${e.apiSecret}`).toString("base64")}` };
}

export type CloudinaryAsset = { public_id: string; secure_url: string; format: string; width: number; height: number; bytes: number; tags?: string[] };

/** Ask Cloudinary (not the browser) what an uploaded asset really is. */
export async function fetchAsset(publicId: string): Promise<CloudinaryAsset | null> {
  if (!isValidPublicId(publicId)) throw Errors.badRequest("Invalid image id.");
  const { cloud, header } = basicAuth();
  const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload/${publicId}`, {
    headers: { Authorization: header },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw Errors.upstream("The image service could not be reached. Please try again.");
  return (await res.json()) as CloudinaryAsset;
}

export async function deleteAsset(publicId: string): Promise<void> {
  if (!isValidPublicId(publicId)) throw Errors.badRequest("Invalid image id.");
  const { cloud, header } = basicAuth();
  const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload?public_ids[]=${encodeURIComponent(publicId)}`, {
    method: "DELETE",
    headers: { Authorization: header },
  });
  if (!res.ok) throw Errors.upstream("The image service could not delete the file.");
}

/** Remove the "unconfirmed" tag once the image is attached to a product. */
export async function confirmAssetTag(publicId: string): Promise<void> {
  const e = requireFeature("cloudinary").cloudinary;
  const params = { command: "remove", public_ids: publicId, tag: UNCONFIRMED_TAG, timestamp: Math.floor(Date.now() / 1000) };
  const form = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: e.apiKey!, signature: signCloudinaryParams(params, e.apiSecret!) });
  const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${e.cloudName}/image/tags`, { method: "POST", body: form });
  if (!res.ok) throw Errors.upstream("The image service could not confirm the file.");
}
