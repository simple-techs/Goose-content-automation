import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getSupabaseAdmin } from "@/lib/supabase";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", req.url));
  }

  const oauth2Client = getOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    return NextResponse.redirect(new URL("/?error=no_refresh_token", req.url));
  }

  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email || "unknown";

  const db = getSupabaseAdmin();

  const { data: existing } = await db
    .from("app_settings")
    .select("id")
    .limit(1)
    .single();

  if (existing) {
    await db
      .from("app_settings")
      .update({
        google_refresh_token: tokens.refresh_token,
        google_email: email,
        google_connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  }

  return NextResponse.redirect(new URL("/?google=connected", req.url));
}
