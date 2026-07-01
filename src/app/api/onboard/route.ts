import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { onboardPersona } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const personaIds: string[] | undefined = body.personaIds;
  const all: boolean = body.all === true;

  let ids: string[] = [];

  if (all) {
    const { data, error } = await getSupabaseAdmin()
      .from("personas")
      .select("id")
      .eq("status", "pending");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    ids = (data || []).map((p: { id: string }) => p.id);
  } else if (personaIds && personaIds.length > 0) {
    ids = personaIds;
  } else {
    return NextResponse.json(
      { error: "Provide personaIds array or set all: true" },
      { status: 400 }
    );
  }

  if (ids.length === 0) {
    return NextResponse.json({ message: "No personas to onboard", results: [] });
  }

  const results: Array<{ id: string; success: boolean; error?: string }> = [];
  const BATCH_SIZE = 3;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (id) => {
      try {
        await onboardPersona(id);
        return { id, success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { id, success: false, error: message };
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  return NextResponse.json({
    total: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}
