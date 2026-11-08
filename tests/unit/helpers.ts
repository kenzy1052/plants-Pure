import crypto from "node:crypto";
import { resetServerEnvCache } from "@/lib/env/server";

/** Fake (non-secret) values that look real enough to pass validation. */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://example-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test-key-aaaaaaaaaaaaaaaaaaaa",
  SUPABASE_SERVICE_ROLE_KEY: "service-test-key-bbbbbbbbbbbbbbbbbbb",
  PAYSTACK_SECRET_KEY: "sk_test_unit0test0key0000",
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "demo-cloud",
  CLOUDINARY_API_KEY: "123456789012345",
  CLOUDINARY_API_SECRET: "cloudinary-secret-for-tests",
  RESEND_API_KEY: "re_unitTestKey000000000000",
  RESEND_FROM_EMAIL: "Plants & Pure <orders@example.test>",
  EMAIL_MODE: "sandbox",
  EMAIL_SANDBOX_RECIPIENT: "sandbox@example.test",
};

const saved: Record<string, string | undefined> = {};
export function setEnv(overrides: Record<string, string | undefined> = {}, base: Record<string, string> = TEST_ENV) {
  const all: Record<string, string | undefined> = { ...base, ...overrides };
  const keys = new Set([...Object.keys(TEST_ENV), ...Object.keys(overrides)]);
  for (const k of keys) {
    if (!(k in saved)) saved[k] = process.env[k];
    if (all[k] === undefined) delete process.env[k];
    else (process.env as Record<string, string>)[k] = all[k]!;
  }
  resetServerEnvCache();
}
export function restoreEnv() {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else (process.env as Record<string, string>)[k] = v;
    delete saved[k];
  }
  resetServerEnvCache();
}

export function paystackSignature(raw: string, secret = TEST_ENV.PAYSTACK_SECRET_KEY) {
  return crypto.createHmac("sha512", secret).update(raw).digest("hex");
}

export function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

type RpcHandler = (args: Record<string, unknown>) => { data?: unknown; error?: unknown } | Promise<{ data?: unknown; error?: unknown }>;

/** Minimal stand-in for the service-role Supabase client: records every RPC call. */
export function fakeAdmin(handlers: Record<string, RpcHandler>, tables: Record<string, unknown> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const h = handlers[fn];
      if (!h) throw new Error(`unexpected rpc ${fn}`);
      const r = await h(args);
      return { data: r.data ?? null, error: r.error ?? null };
    },
    from: (table: string) => {
      const result = { data: tables[table] ?? null, error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "insert", "update"]) chain[m] = () => chain;
      chain.maybeSingle = async () => result;
      chain.single = async () => result;
      chain.then = (res: (v: unknown) => unknown) => res(result);
      return chain;
    },
  };
  return { client: client as never, calls };
}
