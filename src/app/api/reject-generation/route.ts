import { NextRequest, NextResponse } from "next/server";
import { rejectGeneration } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const generationLogId: string | undefined = body.generationLogId;

  if (!generationLogId) {
    return NextResponse.json(
      { error: "generationLogId is required" },
      { status: 400 }
    );
  }

  try {
    await rejectGeneration(generationLogId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
