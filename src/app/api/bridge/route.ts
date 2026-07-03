import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");

  if (token && token.length > 50) {
    await getSupabaseAdmin()
      .from("app_settings")
      .update({
        higgsfield_access_token: token,
        higgsfield_token_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .not("id", "is", null);
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
