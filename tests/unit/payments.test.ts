import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setPaystackFetchForTests, initializePaystackTransaction, verifyPaystackSignature, verifyPaystackTransaction } from "@/lib/paystack";
import { __setSupabaseAdminForTests } from "@/lib/supabase/admin";
import { __setEmailFetchForTests } from "@/lib/email/send";
import { __resetRateLimitsForTests } from "@/lib/api/rate-limit";
import { fakeAdmin, jsonRequest, paystackSignature, restoreEnv, setEnv, TEST_ENV } from "./helpers";

// next/headers is only available inside a Next request; the routes under test don't need a session.
vi.mock("@/lib/api/auth", () => ({ getSessionUser: async () => null, requireUser: async () => { throw new Error("n/a"); }, requireRole: async () => { throw new Error("n/a"); } }));

const okJson = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const verifyBody = (over: Record<string, unknown> = {}) => ({
  status: true,
  data: { id: 99, status: "success", reference: "PP-7-aaaaaaaaaaaa", amount: 5500, currency: "GHS", channel: "mobile_money", gateway_response: "Approved", paid_at: "2026-10-20T10:00:00Z", ...over },
});

beforeEach(() => {
  setEnv();
  __resetRateLimitsForTests();
});
afterEach(() => {
  __setPaystackFetchForTests(undefined);
  __setSupabaseAdminForTests(undefined);
  __setEmailFetchForTests(undefined);
  restoreEnv();
});

describe("Paystack signature", () => {
  const raw = JSON.stringify({ event: "charge.success", data: { reference: "PP-7-aaaaaaaaaaaa" } });
  it("accepts a correct HMAC-SHA512 of the raw body", () => {
    expect(verifyPaystackSignature(raw, paystackSignature(raw))).toBe(true);
    expect(verifyPaystackSignature(raw, paystackSignature(raw).toUpperCase())).toBe(true);
  });
  it("rejects missing, wrong, truncated, non-hex and body-tampered signatures without throwing", () => {
    expect(verifyPaystackSignature(raw, null)).toBe(false);
    expect(verifyPaystackSignature(raw, "")).toBe(false);
    expect(verifyPaystackSignature(raw, "deadbeef")).toBe(false);
    expect(verifyPaystackSignature(raw, "zz".repeat(64))).toBe(false);
    expect(verifyPaystackSignature(raw, paystackSignature(raw).slice(0, -2))).toBe(false);
    expect(verifyPaystackSignature(raw + " ", paystackSignature(raw))).toBe(false);
    expect(verifyPaystackSignature(raw, paystackSignature(raw, "sk_test_someOtherKey000000"))).toBe(false);
  });
});

describe("Paystack API client", () => {
  it("initialises with integer minor units, GHS, the server secret and a reference; no secret in the body", async () => {
    const fetchMock = vi.fn(async () => okJson({ status: true, data: { authorization_url: "https://checkout.paystack.com/abc", access_code: "abc", reference: "PP-7-aaaaaaaaaaaa" } }));
    __setPaystackFetchForTests(fetchMock as never);
    const data = await initializePaystackTransaction({ email: "a@b.co", amountMinor: 5500, currency: "GHS", reference: "PP-7-aaaaaaaaaaaa", callbackUrl: "http://localhost:3000/checkout/callback" });
    expect(data.authorization_url).toContain("paystack.com");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TEST_ENV.PAYSTACK_SECRET_KEY}`);
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ amount: 5500, currency: "GHS", reference: "PP-7-aaaaaaaaaaaa" });
    expect(init.body as string).not.toContain(TEST_ENV.PAYSTACK_SECRET_KEY);
  });
  it("refuses non-integer or non-positive amounts", async () => {
    await expect(initializePaystackTransaction({ email: "a@b.co", amountMinor: 55.5, currency: "GHS", reference: "r", callbackUrl: "x" })).rejects.toThrow(RangeError);
    await expect(initializePaystackTransaction({ email: "a@b.co", amountMinor: 0, currency: "GHS", reference: "r", callbackUrl: "x" })).rejects.toThrow(RangeError);
  });
  it("maps provider errors to a safe 502 without forwarding Paystack's message", async () => {
    __setPaystackFetchForTests((async () => okJson({ status: false, message: "Invalid key sk_test_leakyleakyleaky" }, 401)) as never);
    await expect(verifyPaystackTransaction("PP-7-aaaaaaaaaaaa")).rejects.toMatchObject({ status: 502 });
    await verifyPaystackTransaction("x").catch((e) => expect(String(e.message)).not.toMatch(/leaky/));
  });
  it("times out instead of hanging", async () => {
    vi.useFakeTimers();
    try {
      __setPaystackFetchForTests(((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as never);
      const p = verifyPaystackTransaction("PP-7-aaaaaaaaaaaa");
      const assertion = expect(p).rejects.toMatchObject({ status: 502 });
      await vi.advanceTimersByTimeAsync(16_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("POST /api/webhooks/paystack", () => {
  async function post(raw: string, sig: string | null = paystackSignature(raw)) {
    const { POST } = await import("@/app/api/webhooks/paystack/route");
    return POST(new Request("http://localhost:3000/api/webhooks/paystack", { method: "POST", body: raw, headers: sig ? { "x-paystack-signature": sig } : {} }));
  }
  const event = (over: Record<string, unknown> = {}) => JSON.stringify({ event: "charge.success", data: { id: 99, reference: "PP-7-aaaaaaaaaaaa", status: "success", amount: 1, ...over } });

  it("rejects a bad or missing signature with 401 and touches nothing", async () => {
    const { client, calls } = fakeAdmin({});
    __setSupabaseAdminForTests(client);
    expect((await post(event(), "00".repeat(64))).status).toBe(401);
    expect((await post(event(), null)).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("applies the amount/status Paystack returns on verification — NOT the numbers in the webhook payload", async () => {
    const { client, calls } = fakeAdmin({
      record_payment_event: () => ({ data: { event_id: 1, already_processed: false } }),
      apply_payment_result: () => ({ data: { outcome: "mismatch", transitioned: false } }),
      complete_payment_event: () => ({}),
    });
    __setSupabaseAdminForTests(client);
    // payload claims amount 1, Paystack says 5500
    __setPaystackFetchForTests((async () => okJson(verifyBody())) as never);
    const res = await post(event({ amount: 1 }));
    expect(res.status).toBe(200);
    const apply = calls.find((c) => c.fn === "apply_payment_result")!;
    expect(apply.args).toMatchObject({ p_reference: "PP-7-aaaaaaaaaaaa", p_provider_status: "success", p_paid_amount_minor: 5500, p_currency: "GHS" });
  });

  it("a replay of an already-processed event is acknowledged without re-applying", async () => {
    const { client, calls } = fakeAdmin({ record_payment_event: () => ({ data: { event_id: 1, already_processed: true } }) });
    __setSupabaseAdminForTests(client);
    const fetchMock = vi.fn();
    __setPaystackFetchForTests(fetchMock as never);
    const res = await post(event());
    expect(res.status).toBe(200);
    expect((await res.json()).data.duplicate).toBe(true);
    expect(calls.map((c) => c.fn)).toEqual(["record_payment_event"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores events that are not charge events and acknowledges them", async () => {
    const { client, calls } = fakeAdmin({ record_payment_event: () => ({ data: { event_id: 2, already_processed: false } }), complete_payment_event: () => ({}) });
    __setSupabaseAdminForTests(client);
    const res = await post(JSON.stringify({ event: "transfer.success", data: { id: 5, reference: "T-1" } }));
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.fn === "complete_payment_event")!.args.p_status).toBe("ignored");
  });

  it("acknowledges a signed but unparseable body so Paystack stops retrying", async () => {
    const { client } = fakeAdmin({});
    __setSupabaseAdminForTests(client);
    expect((await post("not json")).status).toBe(200);
  });

  it("returns 500 (so Paystack retries) when verification fails, and marks the event failed, not processed", async () => {
    const { client, calls } = fakeAdmin({ record_payment_event: () => ({ data: { event_id: 3, already_processed: false } }), complete_payment_event: () => ({}) });
    __setSupabaseAdminForTests(client);
    __setPaystackFetchForTests((async () => okJson({ status: false, message: "down" }, 503)) as never);
    const res = await post(event());
    expect(res.status).toBe(502);
    expect(calls.find((c) => c.fn === "complete_payment_event")!.args.p_status).toBe("failed");
    expect(calls.some((c) => c.fn === "apply_payment_result")).toBe(false);
  });

  it("refuses to apply anything if Paystack answers for a different reference", async () => {
    const { client, calls } = fakeAdmin({ record_payment_event: () => ({ data: { event_id: 4, already_processed: false } }), complete_payment_event: () => ({}) });
    __setSupabaseAdminForTests(client);
    __setPaystackFetchForTests((async () => okJson(verifyBody({ reference: "PP-8-bbbbbbbbbbbb" }))) as never);
    const res = await post(event());
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.fn === "apply_payment_result")).toBe(false);
  });

  it("sends the confirmation e-mail only when the payment transitioned to paid (not on replays)", async () => {
    const order = { id: "o1", order_number: 7, customer_name: "Ama", customer_email: "ama@example.test", subtotal: 50, delivery_fee: 5, total_amount: 55, payment_status: "paid", order_items: [{ product_title: "Cloves", quantity: 1, unit_price: 50 }], delivery_zones: { name: "Accra", is_pickup: false } };
    const mk = (transitioned: boolean) =>
      fakeAdmin(
        {
          record_payment_event: () => ({ data: { event_id: 5, already_processed: false } }),
          apply_payment_result: () => ({ data: { outcome: transitioned ? "paid" : "already_success", transitioned, order_id: "o1" } }),
          complete_payment_event: () => ({}),
          claim_email: () => ({ data: true }),
          finish_email: () => ({}),
        },
        { orders: order, payments: { reference: "PP-7-aaaaaaaaaaaa" } },
      );
    const sendMock = vi.fn(async () => okJson({ id: "msg_1" }));
    __setEmailFetchForTests(sendMock as never);
    __setPaystackFetchForTests((async () => okJson(verifyBody())) as never);

    const first = mk(true);
    __setSupabaseAdminForTests(first.client);
    await post(event());
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(first.calls.find((c) => c.fn === "finish_email")!.args.p_status).toBe("sent");

    const replay = mk(false);
    __setSupabaseAdminForTests(replay.client);
    await post(event());
    expect(sendMock).toHaveBeenCalledTimes(1); // unchanged
  });
});

describe("POST /api/payments/initialize", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    items: [{ productId: "22222222-2222-4222-8222-222222222222", quantity: 2 }],
    zoneId: "33333333-3333-4333-8333-333333333333",
    customer: { name: "Ama Mensah", phone: "0241234567", email: "Ama@Example.test", address: "House 4, Osu" },
    ...over,
  });
  async function post(b: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import("@/app/api/payments/initialize/route");
    return POST(jsonRequest("http://localhost:3000/api/payments/initialize", b, headers));
  }
  const orderRow = { order_id: "o1", order_number: 7, amount_minor: 5500, currency: "GHS", total_amount: 55, payment_status: "pending" };
  const happy = () =>
    fakeAdmin({
      create_checkout_order: () => ({ data: orderRow }),
      begin_payment_attempt: (a) => ({ data: { reference: a.p_reference, authorization_url: null, reused: false } }),
      mark_payment_initialized: () => ({}),
      mark_payment_init_failed: () => ({}),
    });

  it("rejects cross-site requests", async () => {
    const res = await post(body(), { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("validates input (bad quantity, bad email, empty cart, missing zone) with field errors", async () => {
    __setSupabaseAdminForTests(happy().client);
    for (const bad of [
      body({ items: [] }),
      body({ items: [{ productId: "22222222-2222-4222-8222-222222222222", quantity: 0 }] }),
      body({ items: [{ productId: "22222222-2222-4222-8222-222222222222", quantity: 1.5 }] }),
      body({ items: [{ productId: "not-a-uuid", quantity: 1 }] }),
      body({ customer: { name: "A", phone: "x", email: "nope", address: "" } }),
      body({ zoneId: undefined }),
    ]) {
      const res = await post(bad);
      expect(res.status).toBe(422);
    }
  });

  it("never forwards client-supplied prices, totals, fees, status or user id to the database", async () => {
    const h = happy();
    __setSupabaseAdminForTests(h.client);
    __setPaystackFetchForTests((async () => okJson({ status: true, data: { authorization_url: "https://checkout.paystack.com/x", access_code: "x", reference: "r" } })) as never);
    const res = await post(
      body({ total: 0.01, amount: 1, deliveryFee: 0, userId: "99999999-9999-4999-8999-999999999999", paymentStatus: "paid", items: [{ productId: "22222222-2222-4222-8222-222222222222", quantity: 2, price: 0.01, unitPrice: 0.01 }] }),
    );
    expect(res.status).toBe(200);
    const create = h.calls.find((c) => c.fn === "create_checkout_order")!.args;
    expect(create.p_user_id).toBeNull(); // session says guest; body userId is ignored
    expect(create.p_items).toEqual([{ product_id: "22222222-2222-4222-8222-222222222222", quantity: 2 }]);
    expect(JSON.stringify(create)).not.toMatch(/0\.01|paymentStatus|"paid"/);
    expect(create.p_customer_email).toBe("ama@example.test"); // normalised
  });

  it("charges the database amount, in GHS, with the server-generated reference", async () => {
    const h = happy();
    __setSupabaseAdminForTests(h.client);
    const fetchMock = vi.fn(async () => okJson({ status: true, data: { authorization_url: "https://checkout.paystack.com/x", access_code: "ac", reference: "r" } }));
    __setPaystackFetchForTests(fetchMock as never);
    const res = await post(body());
    const json = await res.json();
    expect(json.data.authorizationUrl).toBe("https://checkout.paystack.com/x");
    expect(json.data.reference).toMatch(/^PP-7-[0-9a-f]{12}$/);
    const sent = JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string);
    expect(sent).toMatchObject({ amount: 5500, currency: "GHS", email: "ama@example.test" });
    expect(sent.reference).toBe(json.data.reference);
    expect(h.calls.map((c) => c.fn)).toEqual(["create_checkout_order", "begin_payment_attempt", "mark_payment_initialized"]);
  });

  it("returns the existing payment page for a repeated attempt instead of calling Paystack again", async () => {
    const h = fakeAdmin({
      create_checkout_order: () => ({ data: orderRow }),
      begin_payment_attempt: () => ({ data: { reference: "PP-7-aaaaaaaaaaaa", authorization_url: "https://checkout.paystack.com/old", reused: true } }),
    });
    __setSupabaseAdminForTests(h.client);
    const fetchMock = vi.fn();
    __setPaystackFetchForTests(fetchMock as never);
    const json = await (await post(body())).json();
    expect(json.data).toMatchObject({ authorizationUrl: "https://checkout.paystack.com/old", reused: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the attempt failed (no stuck 'initiated') when Paystack init fails", async () => {
    const h = happy();
    __setSupabaseAdminForTests(h.client);
    __setPaystackFetchForTests((async () => okJson({ status: false, message: "x" }, 500)) as never);
    const res = await post(body());
    expect(res.status).toBe(502);
    expect(h.calls.at(-1)!.fn).toBe("mark_payment_init_failed");
  });

  it("maps stock and availability errors to specific 409s", async () => {
    const err = (message: string, details?: string) => ({ error: { message, details } });
    __setSupabaseAdminForTests(fakeAdmin({ create_checkout_order: () => err("INSUFFICIENT_STOCK", "22222222-2222-4222-8222-222222222222|1") }).client);
    let res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({ code: "insufficient_stock", details: { available: 1 } });
    __setSupabaseAdminForTests(fakeAdmin({ create_checkout_order: () => err("PRODUCT_UNAVAILABLE") }).client);
    res = await post(body());
    expect((await res.json()).error.code).toBe("product_unavailable");
    __setSupabaseAdminForTests(fakeAdmin({ create_checkout_order: () => err("some internal postgres text with secrets") }).client);
    res = await post(body());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toMatch(/secrets/);
  });

  it("returns 503 before creating any order when Paystack is not configured", async () => {
    setEnv({ PAYSTACK_SECRET_KEY: "sk_test_xxxxxxxxxxxx" });
    const h = happy();
    __setSupabaseAdminForTests(h.client);
    const res = await post(body());
    expect(res.status).toBe(503);
    expect(h.calls).toHaveLength(0);
  });

  it("rate limits repeated attempts", async () => {
    __setSupabaseAdminForTests(happy().client);
    __setPaystackFetchForTests((async () => okJson({ status: true, data: { authorization_url: "u", access_code: "a", reference: "r" } })) as never);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await post(body(), { "x-forwarded-for": "203.0.113.9" })).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe("GET /api/payments/status", () => {
  const get = async (ref: string) => {
    const { GET } = await import("@/app/api/payments/status/route");
    return GET(new Request(`http://localhost:3000/api/payments/status?reference=${encodeURIComponent(ref)}`));
  };
  it("rejects malformed references and returns no personal data for valid ones", async () => {
    expect((await get("../../etc/passwd")).status).toBe(422);
    const { client } = fakeAdmin({}, { payments: { reference: "PP-7-aaaaaaaaaaaa", status: "success", orders: { order_number: 7, payment_status: "paid", total_amount: 55, currency: "GHS", customer_email: "leak@x.y", customer_phone: "024" } } });
    __setSupabaseAdminForTests(client);
    const res = await get("PP-7-aaaaaaaaaaaa");
    const json = await res.json();
    expect(json.data).toEqual({ reference: "PP-7-aaaaaaaaaaaa", orderNumber: 7, state: "paid", amount: 55, currency: "GHS" });
  });
  it("asks Paystack when the payment is still open, and shows 'paid' only after the database says so", async () => {
    let status = "pending";
    const { client } = fakeAdmin(
      { apply_payment_result: () => { status = "success"; return { data: { outcome: "paid", transitioned: false } }; } },
      {},
    );
    // dynamic table result: first read open, second read paid
    (client as any).from = () => {
      const row = () => ({ reference: "PP-7-aaaaaaaaaaaa", status, orders: { order_number: 7, payment_status: status === "success" ? "paid" : "pending", total_amount: 55, currency: "GHS" } });
      const chain: any = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: row(), error: null });
      return chain;
    };
    __setSupabaseAdminForTests(client);
    __setPaystackFetchForTests((async () => okJson(verifyBody())) as never);
    const json = await (await get("PP-7-aaaaaaaaaaaa")).json();
    expect(json.data.state).toBe("paid");
  });
  it("stays 'pending' (not an error page) if Paystack is unreachable", async () => {
    const { client } = fakeAdmin({}, { payments: { reference: "PP-7-aaaaaaaaaaaa", status: "pending", orders: { order_number: 7, payment_status: "pending", total_amount: 55, currency: "GHS" } } });
    __setSupabaseAdminForTests(client);
    __setPaystackFetchForTests((async () => { throw new Error("network down"); }) as never);
    const res = await get("PP-7-aaaaaaaaaaaa");
    expect(res.status).toBe(200);
    expect((await res.json()).data.state).toBe("pending");
  });
});
