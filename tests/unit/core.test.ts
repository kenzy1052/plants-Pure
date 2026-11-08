import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, FEATURES, formatEnvReport, isUnset, missingFor, parseServerEnv, requireFeature, validateServerEnv } from "@/lib/env/server";
import { redact, scrub } from "@/lib/api/logger";
import { fromMinorUnits, toMinorUnits, formatGHS } from "@/lib/money";
import { __resetRateLimitsForTests, rateLimit } from "@/lib/api/rate-limit";
import { assertSameOrigin, readJson } from "@/lib/api/request";
import { errorResponse, ApiError } from "@/lib/api/errors";
import { z } from "zod";
import { TEST_ENV, restoreEnv, setEnv, jsonRequest } from "./helpers";

afterEach(() => restoreEnv());

describe("env validation", () => {
  it("treats placeholders and empty values as unset", () => {
    for (const v of [undefined, "", "   ", "your-key-here", "pk_test_xxxxxxxx", "sk_test_xxxxxxxxxxxx", "xxxxxxxx", "<paste here>", "changeme", "replace-me"]) expect(isUnset(v)).toBe(true);
    for (const v of ["sk_test_a1b2c3d4e5", "https://abc.supabase.co", "re_abcdefghijk123", "Plants & Pure <orders@example.com>"]) expect(isUnset(v)).toBe(false);
  });

  it("reports missing variable NAMES, never values", () => {
    const env = parseServerEnv({ ...TEST_ENV, PAYSTACK_SECRET_KEY: "sk_test_xxxxxxxxxxxx", CLOUDINARY_API_SECRET: "" } as unknown as NodeJS.ProcessEnv);
    expect(missingFor("paystack", env)).toEqual(["PAYSTACK_SECRET_KEY"]);
    expect(missingFor("cloudinary", env)).toEqual(["CLOUDINARY_API_SECRET"]);
    const report = formatEnvReport(validateServerEnv(env));
    expect(report).toContain("PAYSTACK_SECRET_KEY");
    expect(report).not.toContain(TEST_ENV.SUPABASE_SERVICE_ROLE_KEY);
    expect(report).not.toContain("sk_test_xxxx");
  });

  it("requireFeature throws a ConfigError naming only variables", () => {
    setEnv({ PAYSTACK_SECRET_KEY: undefined });
    try {
      requireFeature("paystack");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).missing).toEqual(["PAYSTACK_SECRET_KEY"]);
    }
  });

  it("derives Paystack mode from the key prefix and warns about a test key in production", () => {
    expect(parseServerEnv({ ...TEST_ENV, PAYSTACK_SECRET_KEY: "sk_live_abcdefgh1234" } as unknown as NodeJS.ProcessEnv).paystack.mode).toBe("live");
    const prod = parseServerEnv({ ...TEST_ENV, NODE_ENV: "production", EMAIL_MODE: undefined } as unknown as NodeJS.ProcessEnv);
    expect(prod.paystack.mode).toBe("test");
    expect(prod.email.mode).toBe("live"); // production default
    expect(validateServerEnv(prod).warnings.join(" ")).toMatch(/TEST key/);
  });

  it("defaults e-mail to sandbox outside production so real customers are never e-mailed by accident", () => {
    expect(parseServerEnv({ ...TEST_ENV, EMAIL_MODE: undefined } as unknown as NodeJS.ProcessEnv).email.mode).toBe("sandbox");
  });

  it("an empty environment reports every feature as not configured", () => {
    const env = parseServerEnv({ NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv);
    expect(validateServerEnv(env).problems.map((p) => p.feature).sort()).toEqual([...FEATURES].sort());
  });
});

describe("log redaction", () => {
  it("redacts secret-looking keys and PII, and scrubs secret-shaped strings", () => {
    const out = redact({
      authorization: "Bearer abcdefghijklmnop",
      customer_email: "a@b.com",
      phone: "0241234567",
      note: "key sk_test_abcdefgh12345 and re_abcdefghijklmnopqrst and Bearer zzzzzzzzzzzz",
      nested: { password: "hunter2", amount: 5 },
    }) as Record<string, any>;
    expect(out.authorization).toBe("[redacted]");
    expect(out.customer_email).toBe("[pii]");
    expect(out.phone).toBe("[pii]");
    expect(out.note).not.toMatch(/sk_test_abcdefgh|re_abcdefghij|zzzzzzzzzzzz/);
    expect(out.nested.password).toBe("[redacted]");
    expect(out.nested.amount).toBe(5);
    expect(scrub("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk")).toBe("[redacted-jwt]");
  });
});

describe("money", () => {
  it("converts to exact minor units without float drift", () => {
    expect(toMinorUnits("12.50")).toBe(1250);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
    expect(toMinorUnits("19.9")).toBe(1990);
    expect(toMinorUnits(35)).toBe(3500);
    expect(fromMinorUnits(1250)).toBe("12.50");
    expect(fromMinorUnits(5)).toBe("0.05");
    expect(() => toMinorUnits("12.345")).toThrow();
    expect(() => toMinorUnits("abc")).toThrow();
    expect(() => toMinorUnits(NaN)).toThrow();
    expect(formatGHS(12.5)).toBe("GH₵ 12.50");
  });
});

describe("rate limiter", () => {
  it("allows up to max per window then blocks, and resets after the window", () => {
    __resetRateLimitsForTests();
    const lim = { max: 3, windowMs: 1000 };
    expect([1, 2, 3].map(() => rateLimit("k", lim, 0).ok)).toEqual([true, true, true]);
    const blocked = rateLimit("k", lim, 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit("other", lim, 10).ok).toBe(true);
    expect(rateLimit("k", lim, 1500).ok).toBe(true);
  });
});

describe("request guards", () => {
  it("rejects missing or foreign Origin on state-changing requests", () => {
    setEnv();
    expect(() => assertSameOrigin(new Request("http://localhost:3000/x", { method: "POST" }))).toThrow(ApiError);
    expect(() => assertSameOrigin(new Request("http://localhost:3000/x", { method: "POST", headers: { origin: "https://evil.example" } }))).toThrow(/Cross-site/);
    expect(() => assertSameOrigin(new Request("http://localhost:3000/x", { method: "POST", headers: { origin: "http://localhost:3000" } }))).not.toThrow();
  });

  it("readJson enforces content-type, size and schema", async () => {
    const schema = z.object({ a: z.number() });
    await expect(readJson(new Request("http://x/", { method: "POST", body: "{}", headers: { "content-type": "text/plain" } }), schema)).rejects.toMatchObject({ status: 415 });
    await expect(readJson(jsonRequest("http://x/", "x".repeat(100)), schema, 50)).rejects.toMatchObject({ status: 413 });
    await expect(readJson(jsonRequest("http://x/", "{not json"), schema)).rejects.toMatchObject({ status: 400 });
    await expect(readJson(jsonRequest("http://x/", { a: "no" }), schema)).rejects.toBeInstanceOf(z.ZodError);
    await expect(readJson(jsonRequest("http://x/", { a: 1 }), schema)).resolves.toEqual({ a: 1 });
  });
});

describe("error responses", () => {
  it("never leak internals and always use one shape", async () => {
    const res = errorResponse(new Error("password=hunter2 at /srv/secret"), { route: "t" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/hunter2|secret/);
    expect(body.error.requestId).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("no-store");

    const zod = errorResponse((() => { try { z.object({ a: z.string() }).parse({}); } catch (e) { return e; } })(), { route: "t" });
    expect(zod.status).toBe(422);
    expect((await zod.json()).error.code).toBe("validation_failed");

    const cfg = errorResponse(new ConfigError("paystack", ["PAYSTACK_SECRET_KEY"]), { route: "t" });
    expect(cfg.status).toBe(503);
  });
});
