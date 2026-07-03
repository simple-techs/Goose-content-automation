import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const personaId = req.nextUrl.searchParams.get("personaId");

  if (!personaId) {
    return NextResponse.json({ error: "personaId required" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("approval_images")
    .select("*")
    .eq("persona_id", personaId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ images: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const personaId: string | undefined = body.personaId;
  const approvedIds: string[] | undefined = body.approvedIds;
  const action: string | undefined = body.action;

  if (!personaId) {
    return NextResponse.json({ error: "personaId required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  if (action === "reject") {
    await db.from("approval_images").delete().eq("persona_id", personaId);
    await db
      .from("personas")
      .update({
        status: "pending",
        higgsfield_soul_id: null,
        error_message: "Soul ID rejected — ready to re-train",
        updated_at: new Date().toISOString(),
      })
      .eq("id", personaId);

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (!approvedIds || approvedIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one image to approve" },
      { status: 400 }
    );
  }

  await db
    .from("approval_images")
    .update({ approved: true })
    .in("id", approvedIds);

  await db
    .from("approval_images")
    .update({ approved: false })
    .eq("persona_id", personaId)
    .not("id", "in", `(${approvedIds.join(",")})`);

  await db
    .from("personas")
    .update({
      status: "active",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", personaId);

  return NextResponse.json({ ok: true, status: "approved" });
}
