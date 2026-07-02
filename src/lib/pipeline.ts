import { getSupabaseAdmin } from "./supabase";
import {
  listImagesInFolder,
  listAllImagesRecursive,
  downloadFile,
  createSubfolder,
  uploadImageToFolder,
} from "./google-drive";
import {
  createSoulId,
  generateImages,
  getGenerationStatus,
  downloadGeneratedImage,
} from "./higgsfield";
import { sendSlackNotification } from "./slack";
import type { Persona, AppSettings } from "./types";

async function getSettings(): Promise<AppSettings> {
  const { data, error } = await getSupabaseAdmin()
    .from("app_settings")
    .select("*")
    .limit(1)
    .single();
  if (error) throw new Error(`Failed to get settings: ${error.message}`);
  return data as AppSettings;
}

export async function onboardPersona(personaId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: persona, error } = await db
    .from("personas")
    .select("*")
    .eq("id", personaId)
    .single();

  if (error || !persona) {
    throw new Error(`Persona not found: ${personaId}`);
  }

  await db
    .from("personas")
    .update({ status: "onboarding", updated_at: new Date().toISOString() })
    .eq("id", personaId);

  try {
    const images = await listAllImagesRecursive(persona.drive_folder_id);
    if (images.length === 0) {
      throw new Error("No images found in persona Drive folder (checked subfolders too)");
    }

    const maxImages = Math.min(images.length, 10);
    const selectedImages = images.slice(0, maxImages);

    const buffers: Buffer[] = [];
    const names: string[] = [];
    for (const img of selectedImages) {
      const buf = await downloadFile(img.id);
      buffers.push(buf);
      names.push(img.name);
    }

    const result = await createSoulId(persona.name, buffers, names);

    // Generate preview images for approval
    let previewUrls: string[] = [];
    try {
      const genResult = await generateImages(result.soulId, "Professional portrait photo, high quality, natural lighting", 4);
      if (genResult.images && genResult.images.length > 0) {
        previewUrls = genResult.images;
      } else {
        previewUrls = await pollForCompletion(genResult.jobId);
      }
    } catch (genErr) {
      console.error("Preview generation failed, proceeding without previews:", genErr);
    }

    if (previewUrls.length > 0) {
      const rows = previewUrls.map((url) => ({
        persona_id: personaId,
        image_url: url,
      }));
      await db.from("approval_images").insert(rows);
    }

    await db
      .from("personas")
      .update({
        higgsfield_soul_id: result.soulId,
        status: previewUrls.length > 0 ? "pending_approval" : "active",
        image_count: images.length,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", personaId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("personas")
      .update({
        status: "error",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", personaId);
    throw err;
  }
}

async function pollForCompletion(
  jobId: string,
  maxAttempts: number = 60,
  intervalMs: number = 5000
): Promise<string[]> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getGenerationStatus(jobId);
    if (result.status === "completed" && result.images && result.images.length > 0) {
      return result.images;
    }
    if (result.status === "failed") {
      throw new Error(`Generation job ${jobId} failed`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Generation job ${jobId} timed out after ${maxAttempts} attempts`);
}

export async function generateContentForPersona(
  personaId: string,
  customPrompt?: string
): Promise<{ batchId: string; folderUrl: string; imageCount: number }> {
  const db = getSupabaseAdmin();
  const { data: persona, error } = await db
    .from("personas")
    .select("*")
    .eq("id", personaId)
    .single();

  if (error || !persona) {
    throw new Error(`Persona not found: ${personaId}`);
  }

  if (!persona.higgsfield_soul_id) {
    throw new Error(`Persona ${persona.name} has no Soul ID. Onboard first.`);
  }

  const settings = await getSettings();
  const prompt = customPrompt || settings.default_prompt;
  const count = settings.generation_count;

  const now = new Date();
  const batchName = `Batch - ${now.toISOString().split("T")[0]}`;

  const { data: batch, error: batchErr } = await db
    .from("batches")
    .insert({
      persona_id: personaId,
      status: "generating",
    })
    .select()
    .single();

  if (batchErr || !batch) {
    throw new Error(`Failed to create batch: ${batchErr?.message}`);
  }

  try {
    const genResult = await generateImages(persona.higgsfield_soul_id, prompt, count);

    await db.from("generation_logs").insert({
      batch_id: batch.id,
      persona_id: personaId,
      higgsfield_job_id: genResult.jobId,
      prompt,
      status: "processing",
    });

    let imageUrls: string[];
    if (genResult.images && genResult.images.length > 0) {
      imageUrls = genResult.images;
    } else {
      imageUrls = await pollForCompletion(genResult.jobId);
    }

    await db
      .from("generation_logs")
      .update({ status: "completed", output_url: imageUrls.join(",") })
      .eq("batch_id", batch.id);

    await db
      .from("batches")
      .update({ status: "uploading" })
      .eq("id", batch.id);

    const subfolder = await createSubfolder(persona.drive_folder_id, batchName);

    const uploadedFiles = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const imgBuffer = await downloadGeneratedImage(imageUrls[i]);
      const fileName = `${persona.name}_${now.toISOString().split("T")[0]}_${i + 1}.png`;
      const uploaded = await uploadImageToFolder(subfolder.id, fileName, imgBuffer);
      uploadedFiles.push(uploaded);
    }

    await db
      .from("batches")
      .update({
        drive_subfolder_id: subfolder.id,
        drive_subfolder_url: subfolder.webViewLink,
        image_count: uploadedFiles.length,
        status: "completed",
      })
      .eq("id", batch.id);

    if (settings.slack_webhook_url) {
      try {
        await sendSlackNotification(
          settings.slack_webhook_url,
          persona.name,
          subfolder.webViewLink,
          uploadedFiles.length,
          settings.slack_channel || undefined
        );
        await db
          .from("batches")
          .update({ slack_notified: true })
          .eq("id", batch.id);
      } catch {
        // Slack notification is non-critical; log but don't fail
        console.error("Slack notification failed for batch", batch.id);
      }
    }

    return {
      batchId: batch.id,
      folderUrl: subfolder.webViewLink,
      imageCount: uploadedFiles.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("batches")
      .update({ status: "failed", error_message: message })
      .eq("id", batch.id);

    await db
      .from("generation_logs")
      .update({ status: "failed", error_message: message })
      .eq("batch_id", batch.id);

    throw err;
  }
}

export async function runWeeklyGeneration(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ personaId: string; personaName: string; success: boolean; error?: string }>;
}> {
  const { data: personas, error } = await getSupabaseAdmin()
    .from("personas")
    .select("*")
    .eq("status", "active");

  if (error) throw new Error(`Failed to fetch active personas: ${error.message}`);
  if (!personas || personas.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, results: [] };
  }

  const results: Array<{
    personaId: string;
    personaName: string;
    success: boolean;
    error?: string;
  }> = [];

  const BATCH_SIZE = 5;
  for (let i = 0; i < personas.length; i += BATCH_SIZE) {
    const batch = personas.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (persona: Persona) => {
      try {
        await generateContentForPersona(persona.id);
        return { personaId: persona.id, personaName: persona.name, success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          personaId: persona.id,
          personaName: persona.name,
          success: false,
          error: message,
        };
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  return {
    total: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}
