import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/api/request";
import { errorResponse } from "@/lib/api/errors";

/** POST only (a GET link could be triggered by any third-party page). */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
  } catch (err) {
    return errorResponse(err, { route: "auth.sign-out" });
  }
}
