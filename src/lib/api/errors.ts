import { ZodError } from "zod";
import { ConfigError } from "@/lib/env/server";
import { errorFields, logger } from "@/lib/api/logger";

/** An error that is safe to show to the caller. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const Errors = {
  badRequest: (message = "The request could not be understood.", details?: unknown) => new ApiError(400, "bad_request", message, details),
  unauthorized: (message = "Please sign in to continue.") => new ApiError(401, "unauthorized", message),
  forbidden: (message = "You do not have permission to do that.") => new ApiError(403, "forbidden", message),
  notFound: (message = "Not found.") => new ApiError(404, "not_found", message),
  conflict: (code: string, message: string, details?: unknown) => new ApiError(409, code, message, details),
  unprocessable: (code: string, message: string, details?: unknown) => new ApiError(422, code, message, details),
  tooMany: (retryAfterSec: number) =>
    new ApiError(429, "rate_limited", "Too many requests. Please wait a moment and try again.", undefined, {
      "Retry-After": String(Math.max(1, Math.ceil(retryAfterSec))),
    }),
  upstream: (message = "A required service is temporarily unavailable. Please try again shortly.") => new ApiError(502, "upstream_error", message),
  unavailable: (message = "This feature is temporarily unavailable.") => new ApiError(503, "service_unavailable", message),
};

const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(data: T, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json({ ok: true, data }, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

/**
 * Turns anything thrown by a route into ONE consistent, non-leaky JSON shape:
 *   { ok:false, error:{ code, message, details?, requestId } }
 * Internal errors are logged with a requestId and answered generically.
 */
export function errorResponse(err: unknown, ctx: { route: string }): Response {
  const requestId = crypto.randomUUID();
  const dev = process.env.NODE_ENV !== "production";

  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error("api.error", { route: ctx.route, requestId, code: err.code, ...errorFields(err) });
    return Response.json(
      { ok: false, error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}), requestId } },
      { status: err.status, headers: { ...NO_STORE, ...err.headers } },
    );
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      (fields[key] ??= []).push(issue.message);
    }
    return Response.json(
      { ok: false, error: { code: "validation_failed", message: "Some fields are missing or invalid.", details: fields, requestId } },
      { status: 422, headers: NO_STORE },
    );
  }

  if (err instanceof ConfigError) {
    logger.error("api.config_error", { route: ctx.route, requestId, feature: err.feature, missing: err.missing });
    return Response.json(
      {
        ok: false,
        error: {
          code: "service_unavailable",
          message: "This feature is temporarily unavailable.",
          // variable NAMES are a safe, useful diagnostic in development only
          ...(dev ? { details: { feature: err.feature, missing: err.missing } } : {}),
          requestId,
        },
      },
      { status: 503, headers: NO_STORE },
    );
  }

  logger.error("api.unhandled", { route: ctx.route, requestId, ...errorFields(err) });
  return Response.json(
    { ok: false, error: { code: "internal_error", message: "Something went wrong on our side. Please try again.", requestId } },
    { status: 500, headers: NO_STORE },
  );
}

/** Wrap a route handler so every thrown error becomes a safe response. */
export function route<A extends unknown[]>(name: string, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err, { route: name });
    }
  };
}
