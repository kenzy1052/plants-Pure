const ALLOWED_ORIGIN = /^(https:\/\/([a-z0-9-]+\.)*(lovable\.app|lovableproject\.com|plantsandpure\.com)|http:\/\/localhost(:\d+)?)$/i;

export const FALLBACK_ORIGIN = "https://www.plantsandpure.com";

/**
 * The address customers are sent back to after paying. Behind the hosting proxy the server's own
 * request URL is an internal localhost address, so prefer APP_URL, then the browser's Origin /
 * forwarded host (only if it is one of our own domains), and the raw request URL last.
 */
export function resolvePublicOrigin(input: { appUrl?: string | undefined; headers: Headers; requestUrl: string }): string {
  if (input.appUrl) return input.appUrl.replace(/\/+$/, "");
  const host = input.headers.get("x-forwarded-host");
  const candidates = [
    input.headers.get("origin"),
    host ? `${input.headers.get("x-forwarded-proto") ?? "https"}://${host.split(",")[0]!.trim()}` : null,
    new URL(input.requestUrl).origin,
  ];
  for (const c of candidates) if (c && ALLOWED_ORIGIN.test(c)) return c;
  return FALLBACK_ORIGIN;
}
