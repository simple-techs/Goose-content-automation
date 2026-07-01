import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runWeeklyGeneration } from "@/lib/pipeline";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await getSupabaseAdmin()
    .from("app_settings")
    .select("cron_enabled")
    .limit(1)
    .single();

  if (!settings?.cron_enabled) {
    return NextResponse.json({ message: "Cron is disabled" });
  }

  try {
    const result = await runWeeklyGeneration();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
