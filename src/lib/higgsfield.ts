import { getSupabaseAdmin } from "./supabase";

const HIGGSFIELD_API_BASE = "https://fnf.higgsfield.ai";

export interface SoulIdResult {
  soulId: string;
  status: string;
}

export interface GenerationResult {
  jobId: string;
  status: string;
  images?: string[];
}

interface HiggsFieldAuth {
  access_token: string;
  user_id: string;
  workspace_id: string;
}

async function getAuth(): Promise<HiggsFieldAuth> {
  const { data } = await getSupabaseAdmin()
    .from("app_settings")
    .select(
      "higgsfield_access_token, higgsfield_user_id, higgsfield_workspace_id"
    )
    .limit(1)
    .single();

  if (!data?.higgsfield_user_id || !data?.higgsfield_workspace_id) {
    throw new Error(
      "Higgsfield not connected. Go to Settings and connect your account."
    );
  }

  if (!data.higgsfield_access_token) {
    throw new Error(
      "Higgsfield session token missing. Go to Settings and paste a fresh session token."
    );
  }

  return {
    access_token: data.higgsfield_access_token,
    user_id: data.higgsfield_user_id,
    workspace_id: data.higgsfield_workspace_id,
  };
}

function buildHeaders(auth: HiggsFieldAuth): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.access_token}`,
    "X-Fnf-Surface": "mcp",
    "X-Fnf-User-Id": auth.user_id,
    "X-Fnf-Workspace-Id": auth.workspace_id,
  };
}

async function apiCall(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const auth = await getAuth();
  const headers = buildHeaders(auth);

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const res = await fetch(`${HIGGSFIELD_API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    throw new Error(
      "Higgsfield session token expired. Go to Settings and paste a fresh token."
    );
  }

  return res;
}

async function uploadImage(
  imageBuffer: Buffer,
  imageName: string
): Promise<string> {
  const formData = new FormData();
  const uint8 = new Uint8Array(imageBuffer);
  const blob = new Blob([uint8], { type: "image/jpeg" });
  formData.append("file", blob, imageName);

  const res = await apiCall("/developer/v2alpha/media?type=image", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Image upload failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.id || data.media_id;
}

export async function createSoulId(
  name: string,
  imageBuffers: Buffer[],
  imageNames: string[]
): Promise<SoulIdResult> {
  const mediaIds: string[] = [];
  for (let i = 0; i < imageBuffers.length; i++) {
    const mediaId = await uploadImage(imageBuffers[i], imageNames[i]);
    mediaIds.push(mediaId);
  }

  const res = await apiCall("/developer/v2alpha/souls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      type: "soul_2",
      images: mediaIds.map((id) => ({ id })),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Higgsfield createSoulId failed (${res.status}): ${errText}`
    );
  }

  const data = await res.json();
  return {
    soulId: data.id || data.soul_id || data.soulId,
    status: data.status || "created",
  };
}

export async function getSoulIdStatus(
  soulId: string
): Promise<{ status: string }> {
  const res = await apiCall(`/developer/v2alpha/souls/${soulId}`);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Higgsfield getSoulIdStatus failed (${res.status}): ${errText}`
    );
  }

  const data = await res.json();
  return { status: data.status };
}

export async function generateImages(
  soulId: string,
  prompt: string,
  count: number = 4
): Promise<GenerationResult> {
  const res = await apiCall("/developer/v2alpha/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      soul_id: soulId,
      prompt,
      num_images: count,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Higgsfield generateImages failed (${res.status}): ${errText}`
    );
  }

  const data = await res.json();
  return {
    jobId: data.id || data.job_id || data.jobId,
    status: data.status || "queued",
    images: data.images || data.output_urls || [],
  };
}

export async function getGenerationStatus(
  jobId: string
): Promise<GenerationResult> {
  const res = await apiCall(`/developer/v2alpha/jobs/${jobId}`);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Higgsfield getGenerationStatus failed (${res.status}): ${errText}`
    );
  }

  const data = await res.json();
  return {
    jobId: data.id || data.job_id || data.jobId,
    status: data.status,
    images: data.images || data.output_urls || [],
  };
}

export async function downloadGeneratedImage(
  imageUrl: string
): Promise<Buffer> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download image from ${imageUrl}: ${res.status}`
    );
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function listSouls(): Promise<
  Array<{ id: string; name: string; status: string; type: string }>
> {
  const res = await apiCall("/developer/v2alpha/souls?size=100");

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Higgsfield listSouls failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return (data.items || []).map(
    (s: { id: string; name: string; status: string; type: string }) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      type: s.type,
    })
  );
}
