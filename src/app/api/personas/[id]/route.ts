import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: persona, error } = await getSupabaseAdmin()
    .from("personas")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !persona) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const { data: batches } = await getSupabaseAdmin()
    .from("batches")
    .select("*")
    .eq("persona_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ persona, batches: batches || [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const allowedFields = ["name", "status", "higgsfield_soul_id", "error_message"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from("personas")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ persona: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error } = await getSupabaseAdmin().from("personas").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
