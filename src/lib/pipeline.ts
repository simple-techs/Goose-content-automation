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

// Content batch structure: 3 selfies + 2 shirtless + 5 lifestyle = 10 images per batch
const CONTENT_BATCH_SPECS = [
  {
    type: "selfie",
    count: 3,
    suffix: "Close-up selfie photo taken with front-facing iPhone camera. Slightly different facial expression and head angle for each shot — as if taken in a row in the same moment. Casual, candid feel. Arm extended or slightly visible holding the phone.",
  },
  {
    type: "shirtless",
    count: 2,
    suffix: "Shirtless photo showing natural physique. Casual setting, natural iPhone lighting. Relaxed confident pose, not overly posed or flexed. Natural skin texture visible.",
  },
  {
    type: "lifestyle",
    count: 5,
    suffix: "Lifestyle photo in a natural everyday setting (coffee shop, park, street, gym, home, rooftop, etc.). Full or 3/4 body visible. Candid moment — walking, sitting, leaning, or interacting with the environment. Wearing casual everyday clothes.",
  },
];

async function generateImageSet(
  soulId: string,
  basePrompt: string,
  spec: { type: string; count: number; suffix: string }
): Promise<{ type: string; urls: string[] }> {
  const fullPrompt = `${basePrompt}\n\n${spec.suffix}`;
  const urls: string[] = [];

  // Higgsfield MCP caps at 4 per call, so split if needed
  const remaining = spec.count;
  const batchSize = Math.min(remaining, 4);
  const genResult = await generateImages(soulId, fullPrompt, batchSize);

  if (genResult.images && genResult.images.length > 0) {
    urls.push(...genResult.images);
  } else {
    const completed = await pollForCompletion(genResult.jobId);
    urls.push(...completed);
  }

  // If we need more than 4 (not currently the case but future-proof)
  if (remaining > 4) {
    const extra = remaining - 4;
    const genResult2 = await generateImages(soulId, fullPrompt, extra);
    if (genResult2.images && genResult2.images.length > 0) {
      urls.push(...genResult2.images);
    } else {
      const completed2 = await pollForCompletion(genResult2.jobId);
      urls.push(...completed2);
    }
  }

  return { type: spec.type, urls: urls.slice(0, spec.count) };
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
  const basePrompt = customPrompt || settings.default_prompt;

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
    // Generate all 10 images: 3 selfies + 2 shirtless + 5 lifestyle
    const allImageUrls: { type: string; url: string }[] = [];

    for (const spec of CONTENT_BATCH_SPECS) {
      const fullPrompt = `${basePrompt}\n\n${spec.suffix}`;

      await db.from("generation_logs").insert({
        batch_id: batch.id,
        persona_id: personaId,
        prompt: fullPrompt,
        status: "processing",
      });

      const result = await generateImageSet(persona.higgsfield_soul_id, basePrompt, spec);
      for (const url of result.urls) {
        allImageUrls.push({ type: result.type, url });
      }
    }

    await db
      .from("generation_logs")
      .update({ status: "completed" })
      .eq("batch_id", batch.id);

    await db
      .from("batches")
      .update({ status: "uploading" })
      .eq("id", batch.id);

    const subfolder = await createSubfolder(persona.drive_folder_id, batchName);

    const uploadedFiles = [];
    for (let i = 0; i < allImageUrls.length; i++) {
      const { type, url } = allImageUrls[i];
      const typeIndex = allImageUrls.slice(0, i + 1).filter((x) => x.type === type).length;
      const imgBuffer = await downloadGeneratedImage(url);
      const fileName = `${persona.name}_${type}_${typeIndex}_${now.toISOString().split("T")[0]}.png`;
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
