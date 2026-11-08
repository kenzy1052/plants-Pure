import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

/** Pages that must never be indexed or cached by shared caches. */
const PRIVATE_PATHS = ["/account/:path*", "/admin/:path*", "/auth/:path*", "/checkout/:path*", "/api/:path*"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Only OUR Cloudinary account may be optimised. Anything else is refused.
    remotePatterns: cloudName
      ? [{ protocol: "https", hostname: "res.cloudinary.com", pathname: `/${cloudName}/**` }]
      : [],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // HSTS only in production (localhost over http must keep working).
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
          // NOTE: a Content-Security-Policy needs nonce plumbing for Next's inline
          // scripts; it is scheduled for Phase 9 (see docs/DECISIONS.md D-9).
        ],
      },
      ...PRIVATE_PATHS.map((source) => ({
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      })),
    ];
  },
};

export default nextConfig;
