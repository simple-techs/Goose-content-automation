import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("app_settings")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

export async function PUT(req: NextRequest) {
  const db = getSupabaseAdmin();
  const body = await req.json();

  const allowedFields = [
    "parent_drive_folder_id",
    "slack_webhook_url",
    "slack_channel",
    "default_prompt",
    "approval_prompt",
    "generation_count",
    "cron_enabled",
    "cron_day",
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  const { data: existing } = await db
    .from("app_settings")
    .select("id")
    .limit(1)
    .single();

  if (!existing) {
    const { data, error } = await db
      .from("app_settings")
      .insert(updates)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ settings: data });
  }

  const { data, error } = await db
    .from("app_settings")
    .update(updates)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
