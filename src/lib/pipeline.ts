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
// Type-specific prompt goes FIRST so it's the primary instruction, base quality prompt follows
const CONTENT_BATCH_SPECS = [
  {
    type: "selfie",
    count: 3,
    prefix: "PHOTO TYPE: Close-up selfie taken with front-facing iPhone camera. The subject's arm is extended or slightly visible holding the phone. Frame from chest/shoulders up. Each image should have a slightly different facial expression and head angle — as if 3 selfies were taken in a row in the same moment. Casual, candid feel.",
  },
  {
    type: "shirtless",
    count: 2,
    prefix: "PHOTO TYPE: Shirtless photo of the subject showing natural physique. No shirt on. Casual indoor or outdoor setting. Natural iPhone lighting. Relaxed confident pose — not overly posed or flexed. Natural skin texture, pores, and body hair fully visible. Waist up or full body framing.",
  },
  {
    type: "lifestyle",
    count: 4,
    prefix: "PHOTO TYPE: Lifestyle photo in a natural everyday setting (coffee shop, park, city street, gym, apartment, rooftop, beach, restaurant, etc.). Full body or 3/4 body visible. The subject is in a candid moment — walking, sitting, leaning against a wall, or interacting naturally with the environment. Wearing casual everyday clothes. Each image should be a DIFFERENT setting/location.",
  },
  {
    type: "lifestyle",
    count: 1,
    prefix: "PHOTO TYPE: Lifestyle photo in a unique everyday setting different from typical locations. Could be a bookstore, record shop, farmers market, hiking trail, basketball court, or similar. Full body or 3/4 body visible. Candid natural moment. Wearing casual everyday clothes.",
  },
];

export async function generateContentForPersona(
  personaId: string,
  customPrompt?: string
): Promise<{ batchId: string }> {
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
    // Submit all generation jobs immediately (no polling — that happens async)
    for (const spec of CONTENT_BATCH_SPECS) {
      // Type-specific prompt FIRST, then base quality parameters
      const fullPrompt = `${spec.prefix}\n\nQUALITY PARAMETERS:\n${basePrompt}`;

      const genResult = await generateImages(
        persona.higgsfield_soul_id,
        fullPrompt,
        spec.count
      );

      await db.from("generation_logs").insert({
        batch_id: batch.id,
        persona_id: personaId,
        higgsfield_job_id: genResult.jobId,
        prompt: fullPrompt,
        image_type: spec.type,
        status: "processing",
      });
    }

    return { batchId: batch.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("batches")
      .update({ status: "failed", error_message: message })
      .eq("id", batch.id);
    throw err;
  }
}

export async function checkAndFinalizeGeneration(): Promise<{
  checked: number;
  completed: number;
  stillProcessing: number;
}> {
  const db = getSupabaseAdmin();

  // Find all batches in "generating" status
  const { data: batches } = await db
    .from("batches")
    .select("id, persona_id")
    .eq("status", "generating");

  if (!batches || batches.length === 0) {
    return { checked: 0, completed: 0, stillProcessing: 0 };
  }

  let completed = 0;
  let stillProcessing = 0;

  for (const batch of batches) {
    // Get all generation logs for this batch
    const { data: logs } = await db
      .from("generation_logs")
      .select("*")
      .eq("batch_id", batch.id);

    if (!logs || logs.length === 0) continue;

    let allDone = true;
    let anyFailed = false;

    for (const log of logs) {
      if (log.status === "completed" || log.status === "failed") continue;
      if (!log.higgsfield_job_id) continue;

      // Check job status on Higgsfield
      try {
        const jobResult = await getGenerationStatus(log.higgsfield_job_id);

        if (jobResult.status === "completed" && jobResult.images && jobResult.images.length > 0) {
          await db
            .from("generation_logs")
            .update({
              status: "completed",
              output_url: jobResult.images.join(","),
            })
            .eq("id", log.id);
        } else if (jobResult.status === "failed") {
          await db
            .from("generation_logs")
            .update({ status: "failed", error_message: "Generation job failed" })
            .eq("id", log.id);
          anyFailed = true;
        } else {
          allDone = false;
        }
      } catch {
        allDone = false;
      }
    }

    if (!allDone) {
      stillProcessing++;
      continue;
    }

    // All jobs done — download images and upload to Drive
    try {
      const { data: completedLogs } = await db
        .from("generation_logs")
        .select("*")
        .eq("batch_id", batch.id)
        .eq("status", "completed");

      if (!completedLogs || completedLogs.length === 0) {
        if (anyFailed) {
          await db.from("batches").update({ status: "failed", error_message: "All generation jobs failed" }).eq("id", batch.id);
        }
        continue;
      }

      await db.from("batches").update({ status: "uploading" }).eq("id", batch.id);

      const { data: persona } = await db
        .from("personas")
        .select("name, drive_folder_id")
        .eq("id", batch.persona_id)
        .single();

      if (!persona) continue;

      const now = new Date();
      const batchName = `Batch - ${now.toISOString().split("T")[0]}`;
      const batchFolder = await createSubfolder(persona.drive_folder_id, batchName);

      // Create per-type subfolders inside the batch folder
      const pillarNames: Record<string, string> = {
        selfie: "Selfies",
        shirtless: "Shirtless",
        lifestyle: "Lifestyle",
      };
      const pillarFolders: Record<string, { id: string }> = {};

      // Determine which types we have
      const imageTypes = [...new Set(completedLogs.map((l) => l.image_type || "general"))];
      for (const t of imageTypes) {
        const folderName = pillarNames[t] || t;
        pillarFolders[t] = await createSubfolder(batchFolder.id, folderName);
      }

      const uploadedFiles = [];
      const typeCounts: Record<string, number> = {};

      // Sort logs by type order: selfie → shirtless → lifestyle
      const typeOrder = ["selfie", "shirtless", "lifestyle"];
      const sortedLogs = [...completedLogs].sort((a, b) => {
        const ai = typeOrder.indexOf(a.image_type || "general");
        const bi = typeOrder.indexOf(b.image_type || "general");
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      for (const log of sortedLogs) {
        const urls = (log.output_url || "").split(",").filter(Boolean);
        const imageType = log.image_type || "general";
        const targetFolder = pillarFolders[imageType] || batchFolder;

        for (const url of urls) {
          typeCounts[imageType] = (typeCounts[imageType] || 0) + 1;
          const typeIndex = typeCounts[imageType];
          const imgBuffer = await downloadGeneratedImage(url);
          const fileName = `${persona.name}_${imageType}_${typeIndex}.png`;
          const uploaded = await uploadImageToFolder(targetFolder.id, fileName, imgBuffer);
          uploadedFiles.push(uploaded);
        }
      }

      await db
        .from("batches")
        .update({
          drive_subfolder_id: batchFolder.id,
          drive_subfolder_url: batchFolder.webViewLink,
          image_count: uploadedFiles.length,
          status: "completed",
        })
        .eq("id", batch.id);

      const settings = await getSettings();
      if (settings.slack_webhook_url) {
        try {
          await sendSlackNotification(
            settings.slack_webhook_url,
            persona.name,
            batchFolder.webViewLink,
            uploadedFiles.length,
            settings.slack_channel || undefined
          );
          await db.from("batches").update({ slack_notified: true }).eq("id", batch.id);
        } catch {
          console.error("Slack notification failed for batch", batch.id);
        }
      }

      completed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.from("batches").update({ status: "failed", error_message: message }).eq("id", batch.id);
    }
  }

  return { checked: batches.length, completed, stillProcessing };
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
