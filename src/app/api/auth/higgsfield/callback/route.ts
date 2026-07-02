import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    const desc = req.nextUrl.searchParams.get("error_description") || error;
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(desc)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?error=Missing+authorization+code", req.url)
    );
  }

  const storedState = req.cookies.get("hf_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL("/?error=Invalid+OAuth+state", req.url)
    );
  }

  const codeVerifier = req.cookies.get("hf_code_verifier")?.value;
  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL("/?error=Missing+code+verifier", req.url)
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/higgsfield/callback`;

  const tokenRes = await fetch("https://clerk.higgsfield.ai/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: "sRGCQJvvJkPrrtRj",
      client_secret: "5gXwyIMviMKs44qj",
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Higgsfield token exchange failed:", errText);
    return NextResponse.redirect(
      new URL(
        `/?error=${encodeURIComponent("Token exchange failed: " + tokenRes.status)}`,
        req.url
      )
    );
  }

  const tokenData = await tokenRes.json();
  const accessToken: string = tokenData.access_token;
  const refreshToken: string = tokenData.refresh_token;

  // Decode JWT to extract user_id and workspace_id
  let userId = "";
  let workspaceId = "";
  let email = "";
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString()
    );
    userId = payload.sub || "";
    workspaceId = payload.workspace_id || "";
    email = payload.email || "";
  } catch {
    console.error("Failed to decode Higgsfield JWT");
  }

  // If we couldn't extract from JWT, try the userinfo endpoint
  if (!userId) {
    try {
      const userRes = await fetch(
        "https://clerk.higgsfield.ai/oauth/userinfo",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (userRes.ok) {
        const userData = await userRes.json();
        userId = userData.sub || userData.user_id || "";
        email = userData.email || email;
      }
    } catch {
      // non-fatal
    }
  }

  await getSupabaseAdmin()
    .from("app_settings")
    .update({
      higgsfield_access_token: accessToken,
      higgsfield_refresh_token: refreshToken,
      higgsfield_user_id: userId,
      higgsfield_workspace_id: workspaceId,
      higgsfield_email: email,
      higgsfield_connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .not("id", "is", null);

  const response = NextResponse.redirect(new URL("/?tab=settings", req.url));
  response.cookies.delete("hf_code_verifier");
  response.cookies.delete("hf_oauth_state");
  return response;
}
