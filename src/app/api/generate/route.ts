import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateContentForPersona } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const personaIds: string[] | undefined = body.personaIds;
  const all: boolean = body.all === true;

  let ids: string[] = [];

  if (all) {
    const { data, error } = await getSupabaseAdmin()
      .from("personas")
      .select("id")
      .eq("status", "active");

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
    return NextResponse.json({ message: "No active personas to generate for", results: [] });
  }

  const results: Array<{
    personaId: string;
    success: boolean;
    generationLogId?: string;
    error?: string;
  }> = [];

  // Each persona gets 1 generation (1 reference image → 1 output image)
  for (const id of ids) {
    try {
      const result = await generateContentForPersona(id);
      results.push({
        personaId: id,
        success: true,
        generationLogId: result.generationLogId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ personaId: id, success: false, error: message });
    }
  }

  return NextResponse.json({
    total: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}
