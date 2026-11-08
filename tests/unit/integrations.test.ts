import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimitsForTests } from "@/lib/api/rate-limit";
import { __setSupabaseAdminForTests } from "@/lib/supabase/admin";
import { __setCloudinaryFetchForTests, createUploadSignature, isAllowedFolder, signCloudinaryParams } from "@/lib/cloudinary/server";
import { cloudinaryUrl, isValidPublicId } from "@/lib/cloudinary/delivery";
import { __setEmailFetchForTests, sendEmail } from "@/lib/email/send";
import { esc, orderConfirmationEmail } from "@/lib/email/templates";
import { fakeAdmin, jsonRequest, restoreEnv, setEnv, TEST_ENV } from "./helpers";

let role: "admin" | "customer" | null = "admin";
vi.mock("@/lib/api/auth", async () => {
  const { Errors } = await import("@/lib/api/errors");
  return {
    getSessionUser: async () => null,
    requireUser: async () => { if (!role) throw Errors.unauthorized(); return { id: "u1", email: "a@b.c" }; },
    requireRole: async (allowed: string[]) => {
      if (!role) throw Errors.unauthorized();
      if (!allowed.includes(role)) throw Errors.forbidden();
      return { id: "u1", email: "a@b.c", role };
    },
  };
});

// Admin image routes act as the signed-in admin (their session client), not the service role.
let sessionDb = fakeAdmin({});
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => sessionDb.client }));

beforeEach(() => { setEnv(); __resetRateLimitsForTests(); role = "admin"; sessionDb = fakeAdmin({}); });
afterEach(() => { __setCloudinaryFetchForTests(undefined); __setEmailFetchForTests(undefined); __setSupabaseAdminForTests(undefined); restoreEnv(); });

describe("Cloudinary signing", () => {
  it("signs sorted params with the secret appended (documented algorithm)", () => {
    const params = { timestamp: 1315060510, folder: "plants-and-pure/products", tags: "unconfirmed", allowed_formats: "jpg,png", file: "ignored", api_key: "ignored" };
    const expected = crypto.createHash("sha1").update("allowed_formats=jpg,png&folder=plants-and-pure/products&tags=unconfirmed&timestamp=1315060510" + "s3cret").digest("hex");
    expect(signCloudinaryParams(params, "s3cret")).toBe(expected);
  });
  it("binds folder, formats and the unconfirmed tag; never returns the secret", () => {
    const sig = createUploadSignature("plants-and-pure/products", 1700000000);
    expect(sig.params).toEqual({ allowed_formats: "jpg,jpeg,png,webp", folder: "plants-and-pure/products", tags: "unconfirmed", timestamp: 1700000000 });
    expect(sig.signature).toBe(signCloudinaryParams(sig.params, TEST_ENV.CLOUDINARY_API_SECRET));
    expect(JSON.stringify(sig)).not.toContain(TEST_ENV.CLOUDINARY_API_SECRET);
    // changing any bound value invalidates it
    expect(signCloudinaryParams({ ...sig.params, folder: "plants-and-pure/site" }, TEST_ENV.CLOUDINARY_API_SECRET)).not.toBe(sig.signature);
  });
  it("only signs allow-listed folders", () => {
    for (const f of ["../etc", "other/products", "plants-and-pure", "plants-and-pure/products/../x", ""]) {
      expect(isAllowedFolder(f)).toBe(false);
      expect(() => createUploadSignature(f)).toThrow();
    }
  });
  it("validates public ids and builds delivery URLs only for our own assets", () => {
    expect(isValidPublicId("plants-and-pure/products/cloves_1")).toBe(true);
    for (const id of ["demo/sample", "plants-and-pure/../x", "plants-and-pure//x", "plants-and-pure/a b", "x"]) expect(isValidPublicId(id)).toBe(false);
    expect(cloudinaryUrl("plants-and-pure/products/cloves", "card", "demo-cloud")).toBe("https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto,c_fill,w_600,h_600/plants-and-pure/products/cloves");
    expect(cloudinaryUrl("evil/x", "card", "demo-cloud")).toBeNull();
    expect(cloudinaryUrl("plants-and-pure/products/x", "card", undefined)).toBeNull();
  });
});

describe("upload routes", () => {
  const sign = async (b: unknown) => (await import("@/app/api/uploads/sign/route")).POST(jsonRequest("http://localhost:3000/api/uploads/sign", b));
  const confirm = async (b: unknown) => (await import("@/app/api/uploads/confirm/route")).POST(jsonRequest("http://localhost:3000/api/uploads/confirm", b));

  it("sign: admin only (401 anonymous, 403 customer)", async () => {
    role = null;
    expect((await sign({})).status).toBe(401);
    role = "customer";
    expect((await sign({})).status).toBe(403);
    role = "admin";
    const res = await sign({ folder: "plants-and-pure/products" });
    expect(res.status).toBe(200);
    expect((await res.json()).data.signature).toMatch(/^[0-9a-f]{40}$/);
  });
  it("sign: refuses a folder outside the allow-list", async () => {
    expect((await sign({ folder: "somewhere/else" })).status).toBe(400);
  });
  it("confirm: admin only", async () => {
    role = "customer";
    expect((await confirm({ productId: "22222222-2222-4222-8222-222222222222", publicId: "plants-and-pure/products/a" })).status).toBe(403);
  });
  it("confirm: rejects and DELETES an oversize or wrong-format asset, records nothing", async () => {
    const { calls } = sessionDb;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Response("{}", { status: 200 })
        : new Response(JSON.stringify({ public_id: "plants-and-pure/products/a", secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/a.gif", format: "gif", width: 10, height: 10, bytes: 1000 }), { status: 200 }),
    );
    __setCloudinaryFetchForTests(fetchMock as never);
    const res = await confirm({ productId: "22222222-2222-4222-8222-222222222222", publicId: "plants-and-pure/products/a" });
    expect(res.status).toBe(422);
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(true);
    expect(calls).toHaveLength(0);

    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === "DELETE" ? new Response("{}", { status: 200 }) : new Response(JSON.stringify({ public_id: "plants-and-pure/products/a", secure_url: "u", format: "jpg", width: 1, height: 1, bytes: 9 * 1024 * 1024 }), { status: 200 }));
    expect((await confirm({ productId: "22222222-2222-4222-8222-222222222222", publicId: "plants-and-pure/products/a" })).status).toBe(422);
  });
  it("confirm: refuses ids outside the products folder before calling Cloudinary", async () => {
    const fetchMock = vi.fn();
    __setCloudinaryFetchForTests(fetchMock as never);
    expect((await confirm({ productId: "22222222-2222-4222-8222-222222222222", publicId: "plants-and-pure/site/hero" })).status).toBe(422);
    expect((await confirm({ productId: "22222222-2222-4222-8222-222222222222", publicId: "demo/sample" })).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("e-mail", () => {
  const msg = { to: "customer@example.test", subject: "Hello", html: "<p>x</p>", text: "x", idempotencyKey: "order_confirmation:o1" };

  it("sandbox mode redirects EVERY message to the sandbox recipient and tags the subject", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
    __setEmailFetchForTests(fetchMock as never);
    const r = await sendEmail(msg);
    expect(r).toEqual({ status: "sent", messageId: "m1" });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(["sandbox@example.test"]);
    expect(body.subject).toBe("[SANDBOX] Hello");
    expect(JSON.stringify(body)).not.toContain("customer@example.test");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("order_confirmation:o1");
  });
  it("sandbox without a recipient sends nothing", async () => {
    setEnv({ EMAIL_SANDBOX_RECIPIENT: undefined });
    const fetchMock = vi.fn();
    __setEmailFetchForTests(fetchMock as never);
    expect(await sendEmail(msg)).toEqual({ status: "skipped", reason: "sandbox_without_recipient" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("off mode and missing configuration send nothing", async () => {
    const fetchMock = vi.fn();
    __setEmailFetchForTests(fetchMock as never);
    setEnv({ EMAIL_MODE: "off" });
    expect((await sendEmail(msg)).status).toBe("skipped");
    setEnv({ EMAIL_MODE: "live", RESEND_API_KEY: undefined });
    expect(await sendEmail(msg)).toEqual({ status: "skipped", reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("live mode sends to the real recipient", async () => {
    setEnv({ EMAIL_MODE: "live" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "m2" }), { status: 200 }));
    __setEmailFetchForTests(fetchMock as never);
    await sendEmail(msg);
    expect(JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string).to).toEqual(["customer@example.test"]);
  });
  it("reports provider failures as failed, flags 5xx/429 retryable, and never throws", async () => {
    __setEmailFetchForTests((async () => new Response(JSON.stringify({ name: "validation_error" }), { status: 422 })) as never);
    expect(await sendEmail(msg)).toMatchObject({ status: "failed", retryable: false });
    __setEmailFetchForTests((async () => new Response("{}", { status: 503 })) as never);
    expect(await sendEmail(msg)).toMatchObject({ status: "failed", retryable: true });
    __setEmailFetchForTests((async () => { throw new Error("socket hang up"); }) as never);
    expect(await sendEmail(msg)).toMatchObject({ status: "failed", retryable: true });
  });
  it("templates escape customer-controlled text", () => {
    expect(esc(`<script>alert("x")</script>&'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;");
    const mail = orderConfirmationEmail({
      orderNumber: 7, customerName: `<img src=x onerror=alert(1)>`, items: [{ title: `<b>Cloves</b>`, quantity: 2, unitPrice: 25 }],
      subtotal: 50, deliveryFee: 5, total: 55, zoneName: `Osu "Central"`, isPickup: false, trackUrl: "http://localhost:3000/checkout/callback?reference=PP-7-aaaaaaaaaaaa",
    });
    expect(mail.html).not.toMatch(/<img src=x|<b>Cloves/);
    expect(mail.html).toContain("&lt;b&gt;Cloves&lt;/b&gt;");
    expect(mail.html).toContain("GH₵ 55.00");
    expect(mail.subject).toContain("#7");
    expect(mail.text).toContain("Total paid: GH₵ 55.00");
    // no unverified claims or invented promises
    expect(mail.html + mail.text).not.toMatch(/guarantee|within \d+|handcraft|free delivery/i);
  });
});

describe("GET /api/health", () => {
  const get = async (headers: Record<string, string> = {}) => (await import("@/app/api/health/route")).GET(new Request("http://localhost:3000/api/health", { headers }));
  it("public response exposes status only; detail needs the token", async () => {
    setEnv({ HEALTH_CHECK_TOKEN: "health-token-for-tests" });
    __setSupabaseAdminForTests({ from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }) } as never);
    const pub = await (await get()).json();
    expect(Object.keys(pub).sort()).toEqual(["status", "time"]);
    expect(pub.status).toBe("ok");
    const wrong = await (await get({ authorization: "Bearer nope" })).json();
    expect(wrong.integrations).toBeUndefined();
    const detail = await (await get({ authorization: "Bearer health-token-for-tests" })).json();
    expect(detail.integrations).toMatchObject({ supabase: true, paystack: true, cloudinary: true, resend: true });
    expect(JSON.stringify(detail)).not.toMatch(/sk_test|service-test-key|cloudinary-secret/);
  });
  it("reports degraded (503) when the database is unreachable", async () => {
    __setSupabaseAdminForTests({ from: () => ({ select: () => ({ limit: async () => ({ error: { message: "boom" } }) }) }) } as never);
    const res = await get();
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("degraded");
  });
});

describe("cloudinary orphan script helpers", () => {
  it("only old, ours, still-tagged uploads are candidates; referenced ones are never orphans", async () => {
    const { staleUploads, splitByReference } = await import("../../scripts/lib/orphans.mjs");
    const now = Date.parse("2026-10-28T12:00:00Z");
    const old = "2026-10-26T00:00:00Z";
    const fresh = "2026-10-28T11:00:00Z";
    const res = [
      { public_id: "plants-and-pure/products/old-orphan", created_at: old, tags: ["unconfirmed"] },
      { public_id: "plants-and-pure/products/old-but-used", created_at: old, tags: ["unconfirmed"] },
      { public_id: "plants-and-pure/products/too-new", created_at: fresh, tags: ["unconfirmed"] },
      { public_id: "someone-else/x", created_at: old, tags: ["unconfirmed"] },
      { public_id: "plants-and-pure/products/confirmed", created_at: old, tags: [] },
    ];
    const cands = staleUploads(res, { now, hours: 24 });
    expect(cands).toEqual(["plants-and-pure/products/old-orphan", "plants-and-pure/products/old-but-used"]);
    const split = splitByReference(cands, ["plants-and-pure/products/old-but-used"]);
    expect(split.orphans).toEqual(["plants-and-pure/products/old-orphan"]);
    expect(split.referenced).toEqual(["plants-and-pure/products/old-but-used"]);
  });
});
