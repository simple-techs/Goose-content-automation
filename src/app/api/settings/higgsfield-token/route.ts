import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token: string | undefined = body.token;

  if (!token || typeof token !== "string" || token.length < 50) {
    return NextResponse.json(
      { ok: false, error: "Invalid token" },
      { status: 400 }
    );
  }

  const { error } = await getSupabaseAdmin()
    .from("app_settings")
    .update({
      higgsfield_access_token: token,
      updated_at: new Date().toISOString(),
    })
    .not("id", "is", null);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
