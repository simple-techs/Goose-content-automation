import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { listSubfolders, listImagesInFolder } from "@/lib/google-drive";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("personas")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ personas: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parentFolderId: string | undefined = body.parentFolderId;

  if (!parentFolderId) {
    const { data: settings } = await getSupabaseAdmin()
      .from("app_settings")
      .select("parent_drive_folder_id")
      .limit(1)
      .single();

    if (!settings?.parent_drive_folder_id) {
      return NextResponse.json(
        { error: "No parent Drive folder ID configured" },
        { status: 400 }
      );
    }

    return syncFromDrive(settings.parent_drive_folder_id);
  }

  return syncFromDrive(parentFolderId);
}

async function syncFromDrive(parentFolderId: string) {
  try {
    const folders = await listSubfolders(parentFolderId);

    const { data: existing } = await getSupabaseAdmin()
      .from("personas")
      .select("drive_folder_id");

    const existingIds = new Set(
      (existing || []).map((p: { drive_folder_id: string }) => p.drive_folder_id)
    );

    let created = 0;
    let skipped = 0;

    for (const folder of folders) {
      if (existingIds.has(folder.id)) {
        skipped++;
        continue;
      }

      const images = await listImagesInFolder(folder.id);

      await getSupabaseAdmin().from("personas").insert({
        name: folder.name,
        drive_folder_id: folder.id,
        drive_folder_url: folder.webViewLink,
        image_count: images.length,
        status: "pending",
      });

      created++;
    }

    return NextResponse.json({
      message: `Sync complete. ${created} new personas added, ${skipped} already exist.`,
      total_folders: folders.length,
      created,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
