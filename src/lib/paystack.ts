import "server-only";
import crypto from "node:crypto";
import { requireFeature } from "@/lib/env/server";
import { Errors } from "@/lib/api/errors";
import { logger } from "@/lib/api/logger";

const BASE = "https://api.paystack.co";
const TIMEOUT_MS = 15_000;

export type FetchLike = typeof fetch;
let fetchImpl: FetchLike = (...a) => fetch(...a);
/** test hook */
export function __setPaystackFetchForTests(f: FetchLike | undefined) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

/**
 * Webhook authenticity: HMAC-SHA512 of the RAW request body with the secret key,
 * compared in constant time. Anything malformed → false (never throws).
 */
export function verifyPaystackSignature(rawBody: string, signatureHeader: string | null, secretKey?: string): boolean {
  const key = secretKey ?? requireFeature("paystack").paystack.secretKey!;
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha512", key).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(signatureHeader.trim().toLowerCase(), "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function call<T>(path: string, init: RequestInit & { json?: unknown }): Promise<T> {
  const key = requireFeature("paystack").paystack.secretKey!;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      cache: "no-store",
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
    if (!res.ok || !body?.status || body.data === undefined) {
      // Paystack's message can be shown in logs but is not forwarded to customers.
      logger.warn("paystack.api_error", { path: path.split("?")[0], httpStatus: res.status, message: body?.message });
      throw Errors.upstream("The payment provider could not process the request. Please try again.");
    }
    return body.data;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.warn("paystack.timeout", { path: path.split("?")[0] });
      throw Errors.upstream("The payment provider took too long to respond. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type PaystackInitData = { authorization_url: string; access_code: string; reference: string };

export async function initializePaystackTransaction(input: {
  email: string;
  amountMinor: number;
  currency: "GHS";
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, string | number>;
}) {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new RangeError("amountMinor must be a positive integer");
  return call<PaystackInitData>("/transaction/initialize", {
    method: "POST",
    json: {
      email: input.email,
      amount: input.amountMinor,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
  });
}

export type PaystackVerifyData = {
  id: number;
  status: string; // success | failed | abandoned | ongoing | pending | reversed | queued
  reference: string;
  amount: number; // minor units
  currency: string;
  channel?: string | null;
  gateway_response?: string | null;
  paid_at?: string | null;
};

/** Server-to-server truth. The ONLY thing allowed to mark an order as paid. */
export function verifyPaystackTransaction(reference: string) {
  return call<PaystackVerifyData>(`/transaction/verify/${encodeURIComponent(reference)}`, {});
}
