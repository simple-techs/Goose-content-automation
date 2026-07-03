import { NextResponse } from "next/server";
import crypto from "crypto";

const MCP_CLIENT_ID = "M1DkV4hbpsSrgjfW";
const MCP_AUTHORIZE_URL = "https://mcp.higgsfield.ai/oauth2/authorize";

export async function GET() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const state = crypto.randomBytes(32).toString("base64url");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/higgsfield/callback`;

  const params = new URLSearchParams({
    client_id: MCP_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email offline_access",
    state,
  });

  const authUrl = `${MCP_AUTHORIZE_URL}?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("hf_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  response.cookies.set("hf_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
