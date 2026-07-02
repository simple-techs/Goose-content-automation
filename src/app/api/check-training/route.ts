import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkSoulTrainingStatus, generateApprovalPreviews } from "@/lib/pipeline";

export async function POST() {
  const db = getSupabaseAdmin();

  // Find all personas in "onboarding" status that have a soul_id (training in progress)
  const { data: onboarding, error } = await db
    .from("personas")
    .select("id, name, higgsfield_soul_id")
    .eq("status", "onboarding")
    .not("higgsfield_soul_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!onboarding || onboarding.length === 0) {
    return NextResponse.json({ message: "No personas training", results: [] });
  }

  const results: Array<{
    id: string;
    name: string;
    trainingStatus: string;
    action: string;
  }> = [];

  for (const persona of onboarding) {
    try {
      const status = await checkSoulTrainingStatus(persona.higgsfield_soul_id);

      if (status === "ready" || status === "completed" || status === "active") {
        // Training complete — generate approval previews
        await generateApprovalPreviews(persona.id, persona.higgsfield_soul_id);
        results.push({
          id: persona.id,
          name: persona.name,
          trainingStatus: status,
          action: "generated_previews",
        });
      } else if (status === "failed" || status === "error") {
        // Training failed
        await db
          .from("personas")
          .update({
            status: "error",
            error_message: `Soul ID training failed (status: ${status})`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", persona.id);
        results.push({
          id: persona.id,
          name: persona.name,
          trainingStatus: status,
          action: "marked_error",
        });
      } else {
        // Still training
        results.push({
          id: persona.id,
          name: persona.name,
          trainingStatus: status,
          action: "still_training",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        id: persona.id,
        name: persona.name,
        trainingStatus: "check_failed",
        action: message,
      });
    }
  }

  return NextResponse.json({ results });
}
