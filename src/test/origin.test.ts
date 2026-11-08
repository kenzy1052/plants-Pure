import { describe, expect, it } from "vitest";
import { FALLBACK_ORIGIN, resolvePublicOrigin } from "@/lib/origin";

const INTERNAL = "http://localhost:8080/_serverFn/x";

describe("payment return address", () => {
  it("sends customers back to the site they paid from, not the internal server address", () => {
    const headers = new Headers({ origin: "https://id-preview--abc.lovable.app" });
    expect(resolvePublicOrigin({ headers, requestUrl: INTERNAL })).toBe("https://id-preview--abc.lovable.app");
  });

  it("ignores an Origin that is not one of our domains", () => {
    const headers = new Headers({ origin: "https://evil.example", "x-forwarded-host": "www.plantsandpure.com" });
    expect(resolvePublicOrigin({ headers, requestUrl: "https://internal.invalid/" })).toBe("https://www.plantsandpure.com");
  });

  it("uses APP_URL when configured", () => {
    expect(resolvePublicOrigin({ appUrl: "https://shop.plantsandpure.com/", headers: new Headers(), requestUrl: INTERNAL })).toBe("https://shop.plantsandpure.com");
  });

  it("falls back to the live site when nothing trustworthy is available", () => {
    expect(resolvePublicOrigin({ headers: new Headers({ origin: "https://evil.example" }), requestUrl: "https://internal.invalid/" })).toBe(FALLBACK_ORIGIN);
  });
});
