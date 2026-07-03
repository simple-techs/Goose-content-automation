import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://higgsfield.ai",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token: string | undefined = body.token;

  if (!token || typeof token !== "string" || token.length < 50) {
    return NextResponse.json(
      { ok: false, error: "Invalid token" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { error } = await getSupabaseAdmin()
    .from("app_settings")
    .update({
      higgsfield_access_token: token,
      higgsfield_token_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .not("id", "is", null);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

export async function GET() {
  const { data } = await getSupabaseAdmin()
    .from("app_settings")
    .select("higgsfield_token_updated_at")
    .limit(1)
    .single();

  const updatedAt = data?.higgsfield_token_updated_at;
  const ageSeconds = updatedAt
    ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)
    : null;

  return NextResponse.json({
    hasToken: !!updatedAt,
    ageSeconds,
    fresh: ageSeconds !== null && ageSeconds < 55,
  });
}
