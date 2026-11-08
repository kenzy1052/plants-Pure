import type { z } from "zod";
import { Errors } from "@/lib/api/errors";
import { getServerEnv } from "@/lib/env/server";

/**
 * CSRF defence for cookie-authenticated, state-changing routes: the browser
 * always sends an Origin header on cross-site and same-site POSTs, so we require
 * it to match our own origin. (SameSite cookies are the first layer; this is the
 * second.) NOT used on the Paystack webhook, which is authenticated by signature.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) throw Errors.forbidden("Cross-site request blocked.");
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(req.url).origin);
  } catch {
    /* ignore */
  }
  try {
    allowed.add(new URL(getServerEnv().appUrl).origin);
  } catch {
    /* ignore */
  }
  let requestOrigin: string;
  try {
    requestOrigin = new URL(origin).origin;
  } catch {
    throw Errors.forbidden("Cross-site request blocked.");
  }
  if (!allowed.has(requestOrigin)) throw Errors.forbidden("Cross-site request blocked.");
}

export const MAX_JSON_BYTES = 32 * 1024;

/** Read a size-limited JSON body and validate it with a zod schema (throws ZodError → 422). */
export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = MAX_JSON_BYTES): Promise<z.infer<S>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new (await import("@/lib/api/errors")).ApiError(415, "unsupported_media_type", "Send the request as application/json.");
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new (await import("@/lib/api/errors")).ApiError(413, "payload_too_large", "The request is too large.");

  const text = await req.text();
  if (text.length > maxBytes) throw new (await import("@/lib/api/errors")).ApiError(413, "payload_too_large", "The request is too large.");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw Errors.badRequest("The request body is not valid JSON.");
  }
  return schema.parse(json);
}
