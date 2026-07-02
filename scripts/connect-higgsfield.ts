#!/usr/bin/env npx tsx
/**
 * Connect Higgsfield to Goose Content Automation
 *
 * Runs a local OAuth flow using the Higgsfield CLI's registered OAuth client
 * (which only allows localhost redirect URIs), then saves the tokens to Supabase.
 *
 * Usage:
 *   npx tsx scripts/connect-higgsfield.ts
 */

import http from "http";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const CLERK_AUTHORIZE = "https://clerk.higgsfield.ai/oauth/authorize";
const CLERK_TOKEN = "https://clerk.higgsfield.ai/oauth/token";
const CLIENT_ID = "sRGCQJvvJkPrrtRj";
const CLIENT_SECRET = "5gXwyIMviMKs44qj";
const PORT = 8765;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://tahoremaufwulpiizxwy.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

async function exchangeCode(
  code: string,
  codeVerifier: string
): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch(CLERK_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

function decodeJWT(token: string): Record<string, string> {
  const payload = Buffer.from(token.split(".")[1], "base64url").toString();
  return JSON.parse(payload);
}

async function saveToSupabase(
  accessToken: string,
  refreshToken: string,
  userId: string,
  workspaceId: string,
  email: string
) {
  if (!SUPABASE_KEY) {
    console.log("\n--- Tokens (save manually in Settings) ---");
    console.log("Access Token:", accessToken.slice(0, 50) + "...");
    console.log("Refresh Token:", refreshToken);
    console.log("User ID:", userId);
    console.log("Workspace ID:", workspaceId);
    console.log("Email:", email);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { error } = await supabase
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

  if (error) {
    console.error("Failed to save to Supabase:", error.message);
    console.log("\n--- Tokens (save manually) ---");
    console.log("Refresh Token:", refreshToken);
    console.log("User ID:", userId);
    console.log("Workspace ID:", workspaceId);
  } else {
    console.log("Tokens saved to Supabase successfully!");
  }
}

async function main() {
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "email profile offline_access user:org:read",
    state,
  });

  const authUrl = `${CLERK_AUTHORIZE}?${params.toString()}`;

  return new Promise<void>((resolve) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Error</h1><p>${url.searchParams.get("error_description") || error}</p>`);
        server.close();
        resolve();
        return;
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Error</h1><p>Invalid callback parameters</p>");
        server.close();
        resolve();
        return;
      }

      try {
        console.log("Exchanging authorization code for tokens...");
        const tokens = await exchangeCode(code, verifier);
        const jwt = decodeJWT(tokens.access_token);

        const userId = jwt.sub || "";
        const workspaceId = jwt.workspace_id || "";
        const email = jwt.email || "";

        console.log(`Authenticated as ${email}`);
        console.log(`User ID: ${userId}`);
        console.log(`Workspace ID: ${workspaceId}`);

        await saveToSupabase(
          tokens.access_token,
          tokens.refresh_token,
          userId,
          workspaceId,
          email
        );

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<html><body style="font-family:system-ui;text-align:center;padding:60px">` +
          `<h1 style="color:#16a34a">Connected!</h1>` +
          `<p>Higgsfield is now connected as <strong>${email}</strong>.</p>` +
          `<p>You can close this tab and return to the app.</p>` +
          `</body></html>`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Error:", msg);
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`<h1>Error</h1><p>${msg}</p>`);
      }

      server.close();
      resolve();
    });

    server.listen(PORT, "127.0.0.1", () => {
      console.log(`\nListening on http://127.0.0.1:${PORT}`);
      console.log("\nOpen this URL in your browser to sign in:\n");
      console.log(authUrl);
      console.log("\nWaiting for callback...");

      // Try to open browser automatically
      const { exec } = require("child_process");
      const cmd =
        process.platform === "darwin"
          ? `open "${authUrl}"`
          : process.platform === "win32"
            ? `start "${authUrl}"`
            : `xdg-open "${authUrl}"`;
      exec(cmd, () => {});
    });
  });
}

main()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
