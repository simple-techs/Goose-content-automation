import { getSupabaseAdmin } from "./supabase";

const HIGGSFIELD_API_BASE = "https://fnf.higgsfield.ai";
const CLERK_TOKEN_ENDPOINT = "https://clerk.higgsfield.ai/oauth/token";
const CLERK_CLIENT_ID = "sRGCQJvvJkPrrtRj";
const CLERK_CLIENT_SECRET = "5gXwyIMviMKs44qj";

export interface SoulIdResult {
  soulId: string;
  status: string;
}

export interface GenerationResult {
  jobId: string;
  status: string;
  images?: string[];
}

interface HiggsFieldTokens {
  access_token: string;
  refresh_token: string;
  user_id: string;
  workspace_id: string;
}

async function getStoredTokens(): Promise<HiggsFieldTokens | null> {
  const { data } = await getSupabaseAdmin()
    .from("app_settings")
    .select(
      "higgsfield_access_token, higgsfield_refresh_token, higgsfield_user_id, higgsfield_workspace_id"
    )
    .limit(1)
    .single();

  if (
    !data?.higgsfield_refresh_token ||
    !data?.higgsfield_user_id ||
    !data?.higgsfield_workspace_id
  ) {
    return null;
  }

  return {
    access_token: data.higgsfield_access_token || "",
    refresh_token: data.higgsfield_refresh_token,
    user_id: data.higgsfield_user_id,
    workspace_id: data.higgsfield_workspace_id,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(CLERK_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLERK_CLIENT_ID,
      client_secret: CLERK_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const newAccessToken: string = data.access_token;
  const newRefreshToken: string = data.refresh_token || refreshToken;

  await getSupabaseAdmin()
    .from("app_settings")
    .update({
      higgsfield_access_token: newAccessToken,
      higgsfield_refresh_token: newRefreshToken,
      updated_at: new Date().toISOString(),
    })
    .not("id", "is", null);

  return newAccessToken;
}

async function getValidAccessToken(): Promise<HiggsFieldTokens> {
  const tokens = await getStoredTokens();
  if (!tokens) {
    throw new Error(
      "Higgsfield not connected. Go to Settings and click 'Connect Higgsfield'."
    );
  }

  const freshToken = await refreshAccessToken(tokens.refresh_token);
  return { ...tokens, access_token: freshToken };
}

function buildHeaders(tokens: HiggsFieldTokens): Record<string, string> {
  return {
    Authorization: `Bearer ${tokens.access_token}`,
    "X-Fnf-Surface": "mcp",
    "X-Fnf-User-Id": tokens.user_id,
    "X-Fnf-Workspace-Id": tokens.workspace_id,
  };
}

async function uploadImage(
  imageBuffer: Buffer,
  imageName: string,
  tokens: HiggsFieldTokens
): Promise<string> {
  const formData = new FormData();
  const uint8 = new Uint8Array(imageBuffer);
  const blob = new Blob([uint8], { type: "image/jpeg" });
  formData.append("file", blob, imageName);

  const headers = buildHeaders(tokens);
  delete headers["Content-Type"];

  const res = await fetch(
    `${HIGGSFIELD_API_BASE}/developer/v2alpha/media?type=image`,
    {
      method: "POST",
      headers,
      body: formData,
    }
  );

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
  const tokens = await getValidAccessToken();

  const mediaIds: string[] = [];
  for (let i = 0; i < imageBuffers.length; i++) {
    const mediaId = await uploadImage(imageBuffers[i], imageNames[i], tokens);
    mediaIds.push(mediaId);
  }

  const headers = buildHeaders(tokens);
  headers["Content-Type"] = "application/json";

  const res = await fetch(`${HIGGSFIELD_API_BASE}/developer/v2alpha/souls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name,
      type: "soul_2",
      images: mediaIds,
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
  const tokens = await getValidAccessToken();
  const res = await fetch(
    `${HIGGSFIELD_API_BASE}/developer/v2alpha/souls/${soulId}`,
    { headers: buildHeaders(tokens) }
  );

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
  const tokens = await getValidAccessToken();
  const headers = buildHeaders(tokens);
  headers["Content-Type"] = "application/json";

  const res = await fetch(
    `${HIGGSFIELD_API_BASE}/developer/v2alpha/jobs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        soul_id: soulId,
        prompt,
        num_images: count,
      }),
    }
  );

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
  const tokens = await getValidAccessToken();
  const res = await fetch(
    `${HIGGSFIELD_API_BASE}/developer/v2alpha/jobs/${jobId}`,
    { headers: buildHeaders(tokens) }
  );

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
  const tokens = await getValidAccessToken();
  const res = await fetch(
    `${HIGGSFIELD_API_BASE}/developer/v2alpha/souls?size=100`,
    { headers: buildHeaders(tokens) }
  );

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
