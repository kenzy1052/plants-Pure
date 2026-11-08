import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16: "middleware" is now called "proxy".
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only the areas that need a session. Public pages and /api routes are not
  // touched (API routes authenticate for themselves).
  matcher: ["/account/:path*", "/admin/:path*"],
};
