import { NextResponse } from "next/server";
import { checkAndFinalizeGeneration } from "@/lib/pipeline";

export async function POST() {
  try {
    const result = await checkAndFinalizeGeneration();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
