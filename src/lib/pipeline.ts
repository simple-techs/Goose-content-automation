import { getSupabaseAdmin } from "./supabase";
import {
  listImagesInFolder,
  listAllImagesRecursive,
  downloadFile,
  uploadImageToFolder,
  findFolderByName,
} from "./google-drive";
import {
  createSoulId,
  generateImages,
  generateWithReference,
  getGenerationStatus,
  getSoulIdStatus,
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

// Approval preview image prompts — each generates 1 image with a specific composition
const APPROVAL_PROMPTS = [
  // Image 1: Collage of 4 face angles
  "A 2x2 collage grid of the same person from 4 different angles: top-left is direct front view half body, top-right is direct front view shoulders up, bottom-left is left side profile shoulders up, bottom-right is right side profile shoulders up. Person is wearing dark blue jeans and a grey t-shirt, standing in front of a plain white wall background. Natural lighting, high quality portrait photography.",
  // Image 2: Full body
  "Full body shot of the person standing straight, facing the camera. Wearing dark blue jeans and a grey t-shirt. Standing in front of a plain white wall background. Natural lighting, high quality portrait photography. Head to toe visible.",
  // Image 3: Waist up at an angle
  "Waist up shot of the person at a slight angle (3/4 turn). Wearing a grey t-shirt. Standing in front of a plain white wall background. Natural lighting, high quality portrait photography. Relaxed natural pose.",
];

export async function checkSoulTrainingStatus(soulId: string): Promise<string> {
  const result = await getSoulIdStatus(soulId);
  return result.status;
}

export async function generateApprovalPreviews(personaId: string, soulId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const settings = await getSettings();

  // Generate 3 approval preview images with specific compositions
  const previewUrls: string[] = [];
  const prompts = settings.approval_prompt
    ? [
        `${settings.approval_prompt} Composition: 2x2 collage grid showing 4 different angles (front half body, front shoulders up, left side shoulders up, right side shoulders up).`,
        `${settings.approval_prompt} Composition: Full body shot, head to toe, standing straight facing camera.`,
        `${settings.approval_prompt} Composition: Waist up at a 3/4 angle, relaxed natural pose.`,
      ]
    : APPROVAL_PROMPTS;

  for (const prompt of prompts) {
    try {
      const genResult = await generateImages(soulId, prompt, 1);
      if (genResult.images && genResult.images.length > 0) {
        previewUrls.push(...genResult.images);
      } else {
        const urls = await pollForCompletion(genResult.jobId);
        previewUrls.push(...urls);
      }
    } catch (genErr) {
      console.error("Preview generation failed for prompt:", prompt, genErr);
    }
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
      status: previewUrls.length > 0 ? "pending_approval" : "active",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", personaId);
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

    // Save soul ID immediately — training happens async on Higgsfield's side
    // The /api/check-training endpoint will poll and generate previews when ready
    await db
      .from("personas")
      .update({
        higgsfield_soul_id: result.soulId,
        status: "onboarding",
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

// Syncs reference images from "general reference" Drive folder into the tracking table
async function syncReferenceImages(settings: AppSettings): Promise<void> {
  const db = getSupabaseAdmin();

  let refFolderId = settings.general_reference_folder_id;
  if (!refFolderId) {
    const folder = await findFolderByName(settings.parent_drive_folder_id, "general reference");
    if (!folder) {
      throw new Error('No "general reference" folder found in Drive. Create one and add reference images.');
    }
    refFolderId = folder.id;
    await db.from("app_settings").update({ general_reference_folder_id: refFolderId }).not("id", "is", null);
  }

  const driveImages = await listImagesInFolder(refFolderId);

  // Insert any new images not yet tracked
  for (const img of driveImages) {
    await db.from("reference_image_usage").upsert(
      { drive_file_id: img.id, drive_file_name: img.name, status: "unused" },
      { onConflict: "drive_file_id", ignoreDuplicates: true }
    );
  }
}

// Pick 1 unused reference image, returns null if none available
async function pickUnusedReferenceImage(): Promise<{
  id: string;
  drive_file_id: string;
  drive_file_name: string;
} | null> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from("reference_image_usage")
    .select("id, drive_file_id, drive_file_name")
    .eq("status", "unused")
    .limit(1)
    .single();

  return data || null;
}

export async function generateContentForPersona(
  personaId: string
): Promise<{ generationLogId: string }> {
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

  // Sync reference images from Drive (picks up new ones)
  await syncReferenceImages(settings);

  // Pick an unused reference image
  const refImage = await pickUnusedReferenceImage();
  if (!refImage) {
    throw new Error("No unused reference images available. Add more images to the 'general reference' folder in Drive.");
  }

  // Mark it as used immediately to prevent double-picks
  await db
    .from("reference_image_usage")
    .update({ status: "used", used_by_persona_id: personaId, used_at: new Date().toISOString() })
    .eq("id", refImage.id);

  // Download reference image from Drive
  const refImageBuffer = await downloadFile(refImage.drive_file_id);

  const prompt = `Recreate this exact scene, pose, composition, and setting but replace the person with the subject from the Soul ID. Keep the same clothing, background, lighting, angle, and framing. The subject must look natural in the scene — not pasted in.\n\nQUALITY PARAMETERS:\n${settings.default_prompt}`;

  try {
    // Generate with reference image
    let genResult;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        genResult = await generateWithReference(
          persona.higgsfield_soul_id,
          refImageBuffer,
          refImage.drive_file_name,
          prompt
        );
        break;
      } catch (retryErr) {
        const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (msg.includes("Rate limit") || msg.includes("rate limit") || msg.includes("concurrent")) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 15000));
        } else {
          throw retryErr;
        }
      }
    }

    if (!genResult) {
      throw new Error("Rate limit exceeded after retries");
    }

    const { data: log } = await db.from("generation_logs").insert({
      persona_id: personaId,
      higgsfield_job_id: genResult.jobId,
      prompt,
      image_type: "reference",
      status: "processing",
    }).select("id").single();

    // Link generation log to reference image
    if (log) {
      await db
        .from("reference_image_usage")
        .update({ generation_log_id: log.id })
        .eq("id", refImage.id);
    }

    return { generationLogId: log?.id || "" };
  } catch (err) {
    // On failure, mark reference image as unused again so it can be retried
    await db
      .from("reference_image_usage")
      .update({ status: "unused", used_by_persona_id: null, used_at: null })
      .eq("id", refImage.id);
    throw err;
  }
}

// Mark a generation as rejected — frees the reference image for reuse
export async function rejectGeneration(generationLogId: string): Promise<void> {
  const db = getSupabaseAdmin();

  await db.from("generation_logs").update({ status: "failed", error_message: "Rejected by user" }).eq("id", generationLogId);

  // Free the reference image for reuse
  await db
    .from("reference_image_usage")
    .update({ status: "unused", used_by_persona_id: null, used_at: null, generation_log_id: null })
    .eq("generation_log_id", generationLogId);
}

export async function checkAndFinalizeGeneration(): Promise<{
  checked: number;
  completed: number;
  stillProcessing: number;
}> {
  const db = getSupabaseAdmin();

  // Find all generation logs in "processing" status
  const { data: logs } = await db
    .from("generation_logs")
    .select("*")
    .eq("status", "processing");

  if (!logs || logs.length === 0) {
    return { checked: 0, completed: 0, stillProcessing: 0 };
  }

  let completed = 0;
  let stillProcessing = 0;

  for (const log of logs) {
    if (!log.higgsfield_job_id) continue;

    try {
      const jobResult = await getGenerationStatus(log.higgsfield_job_id);

      if (jobResult.status === "completed" && jobResult.images && jobResult.images.length > 0) {
        // Job complete — download image and upload to persona's Drive folder
        const { data: persona } = await db
          .from("personas")
          .select("name, drive_folder_id")
          .eq("id", log.persona_id)
          .single();

        if (!persona) continue;

        const imageUrl = jobResult.images[0];
        const imgBuffer = await downloadGeneratedImage(imageUrl);
        const now = new Date();
        const fileName = `${persona.name}_gen_${now.toISOString().replace(/[:.]/g, "-")}.png`;
        await uploadImageToFolder(persona.drive_folder_id, fileName, imgBuffer);

        await db
          .from("generation_logs")
          .update({ status: "completed", output_url: imageUrl })
          .eq("id", log.id);

        completed++;
      } else if (jobResult.status === "failed") {
        await db
          .from("generation_logs")
          .update({ status: "failed", error_message: "Generation job failed on Higgsfield" })
          .eq("id", log.id);

        // Free the reference image for reuse on failure
        await db
          .from("reference_image_usage")
          .update({ status: "unused", used_by_persona_id: null, used_at: null, generation_log_id: null })
          .eq("generation_log_id", log.id);
      } else {
        stillProcessing++;
      }
    } catch {
      stillProcessing++;
    }
  }

  return { checked: logs.length, completed, stillProcessing };
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
