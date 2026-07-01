const HIGGSFIELD_API_BASE = process.env.HIGGSFIELD_API_URL || "https://api.higgsfield.ai/v1";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  if (!apiKey) {
    throw new Error("HIGGSFIELD_API_KEY environment variable is not set");
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export interface SoulIdResult {
  soulId: string;
  status: string;
}

export interface GenerationResult {
  jobId: string;
  status: string;
  images?: string[];
}

export async function createSoulId(
  name: string,
  imageBuffers: Buffer[],
  imageNames: string[]
): Promise<SoulIdResult> {
  const formData = new FormData();
  formData.append("name", name);

  for (let i = 0; i < imageBuffers.length; i++) {
    const uint8 = new Uint8Array(imageBuffers[i]);
    const blob = new Blob([uint8], { type: "image/jpeg" });
    formData.append("images", blob, imageNames[i]);
  }

  const apiKey = process.env.HIGGSFIELD_API_KEY;
  if (!apiKey) {
    throw new Error("HIGGSFIELD_API_KEY environment variable is not set");
  }

  const res = await fetch(`${HIGGSFIELD_API_BASE}/soul-ids`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Higgsfield createSoulId failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    soulId: data.id || data.soul_id || data.soulId,
    status: data.status || "created",
  };
}

export async function getSoulIdStatus(soulId: string): Promise<{ status: string }> {
  const res = await fetch(`${HIGGSFIELD_API_BASE}/soul-ids/${soulId}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Higgsfield getSoulIdStatus failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return { status: data.status };
}

export async function generateImages(
  soulId: string,
  prompt: string,
  count: number = 4
): Promise<GenerationResult> {
  const res = await fetch(`${HIGGSFIELD_API_BASE}/generations`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      soul_id: soulId,
      prompt,
      num_images: count,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Higgsfield generateImages failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    jobId: data.id || data.job_id || data.jobId,
    status: data.status || "queued",
    images: data.images || data.output_urls || [],
  };
}

export async function getGenerationStatus(jobId: string): Promise<GenerationResult> {
  const res = await fetch(`${HIGGSFIELD_API_BASE}/generations/${jobId}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Higgsfield getGenerationStatus failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    jobId: data.id || data.job_id || data.jobId,
    status: data.status,
    images: data.images || data.output_urls || [],
  };
}

export async function downloadGeneratedImage(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to download image from ${imageUrl}: ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
