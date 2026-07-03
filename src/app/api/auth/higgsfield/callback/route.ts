import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const MCP_CLIENT_ID = "M1DkV4hbpsSrgjfW";
const MCP_TOKEN_URL = "https://mcp.higgsfield.ai/oauth2/token";

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

  const tokenRes = await fetch(MCP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: MCP_CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("MCP OAuth token exchange failed:", errText);
    return NextResponse.redirect(
      new URL(
        `/?error=${encodeURIComponent("Token exchange failed: " + tokenRes.status)}`,
        req.url
      )
    );
  }

  const tokenData = await tokenRes.json();
  const accessToken: string = tokenData.access_token;
  const refreshToken: string | undefined = tokenData.refresh_token;

  // Decode JWT to extract user info
  let userId = "";
  let workspaceId = "";
  let email = "";
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString()
    );
    userId = payload.sub || "";
    workspaceId = payload.workspace_id || payload.org_id || "";
    email = payload.email || "";
  } catch {
    console.error("Failed to decode MCP OAuth JWT");
  }

  const updateData: Record<string, string | null> = {
    higgsfield_access_token: accessToken,
    higgsfield_connected_at: new Date().toISOString(),
    higgsfield_token_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (refreshToken) {
    updateData.higgsfield_refresh_token = refreshToken;
  }
  if (userId) {
    updateData.higgsfield_user_id = userId;
  }
  if (workspaceId) {
    updateData.higgsfield_workspace_id = workspaceId;
  }
  if (email) {
    updateData.higgsfield_email = email;
  }

  await getSupabaseAdmin()
    .from("app_settings")
    .update(updateData)
    .not("id", "is", null);

  const response = NextResponse.redirect(new URL("/?tab=settings", req.url));
  response.cookies.delete("hf_code_verifier");
  response.cookies.delete("hf_oauth_state");
  return response;
}
