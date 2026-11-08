import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimitsForTests } from "@/lib/api/rate-limit";
import { __setEmailFetchForTests } from "@/lib/email/send";
import { POST } from "@/app/api/contact/route";
import { contactEmail } from "@/lib/email/contact-message";
import { jsonRequest, restoreEnv, setEnv } from "./helpers";

const valid = () => ({
  clientRequestId: crypto.randomUUID(),
  name: "Abena Mensah",
  email: "Abena@Example.test",
  phone: "024 123 4567",
  subject: "Question about an order",
  message: "Hello, I would like to ask about delivery times.",
});
const send = (body: unknown, headers: Record<string, string> = {}) => POST(jsonRequest("http://localhost:3000/api/contact", body, headers));
const resendOk = () => vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 }));

beforeEach(() => { setEnv(); __resetRateLimitsForTests(); });
afterEach(() => { __setEmailFetchForTests(undefined); restoreEnv(); });

describe("POST /api/contact", () => {
  it("sends one e-mail to the business, replies go to the visitor, idempotent per request id", async () => {
    const f = resendOk();
    __setEmailFetchForTests(f as never);
    const body = valid();
    const res = await send(body);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent.reply_to).toBe("abena@example.test");
    expect(sent.subject).toContain("Question about an order");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(`contact-${body.clientRequestId}`);
  });

  it("is truthful: provider failure -> 502, e-mail off or unconfigured -> 503, never a fake success", async () => {
    __setEmailFetchForTests((async () => new Response("{}", { status: 500 })) as never);
    expect((await send(valid())).status).toBe(502);
    setEnv({ EMAIL_MODE: "off" });
    const off = await send(valid());
    expect(off.status).toBe(503);
    expect((await off.json()).error.message).toContain("plantsandpure@gmail.com");
    setEnv({ RESEND_API_KEY: undefined });
    expect((await send(valid())).status).toBe(503);
  });

  it("validates on the server with field messages", async () => {
    const f = resendOk();
    __setEmailFetchForTests(f as never);
    const res = await send({ ...valid(), email: "nope", message: "short", name: "A", phone: "abc" });
    expect(res.status).toBe(422);
    const { error } = await res.json();
    expect(Object.keys(error.details).sort()).toEqual(["email", "message", "name", "phone"]);
    expect((await send({ ...valid(), subject: "line1\nBcc: x@y.z" })).status).toBe(422); // header-injection shaped input
    expect((await send({ ...valid(), message: "x".repeat(2001) })).status).toBe(422);
    expect((await send({ ...valid(), clientRequestId: "not-a-uuid" })).status).toBe(422);
    expect(f).not.toHaveBeenCalled();
  });

  it("honeypot: looks successful to a bot but sends nothing", async () => {
    const f = resendOk();
    __setEmailFetchForTests(f as never);
    const res = await send({ ...valid(), website: "http://spam.example" });
    expect(res.status).toBe(200);
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects cross-site and non-JSON requests", async () => {
    __setEmailFetchForTests(resendOk() as never);
    expect((await send(valid(), { origin: "https://evil.example" })).status).toBe(403);
    const noOrigin = await POST(new Request("http://localhost:3000/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(valid()) }));
    expect(noOrigin.status).toBe(403);
    expect((await send("{not json")).status).toBe(400);
    const text = await POST(new Request("http://localhost:3000/api/contact", { method: "POST", headers: { "content-type": "text/plain", origin: "http://localhost:3000" }, body: "x" }));
    expect(text.status).toBe(415);
  });

  it("rate-limits repeated submissions (5 per 10 minutes per client)", async () => {
    __setEmailFetchForTests(resendOk() as never);
    for (let i = 0; i < 5; i++) expect((await send(valid(), { "x-forwarded-for": "9.9.9.9" })).status).toBe(200);
    const blocked = await send(valid(), { "x-forwarded-for": "9.9.9.9" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect((await send(valid(), { "x-forwarded-for": "8.8.8.8" })).status).toBe(200); // another client is unaffected
  });
});

describe("contact e-mail content", () => {
  it("escapes everything the visitor typed", () => {
    const m = contactEmail({ name: "<b>x</b>", email: "a@b.c", phone: "", subject: "<img src=x onerror=1>", message: "<script>alert(1)</script>\nline 2" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.text).toContain("<script>alert(1)</script>"); // plain text is not HTML
    expect(m.html).toContain("not provided");
  });
});
