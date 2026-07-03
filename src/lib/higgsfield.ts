import { getSupabaseAdmin } from "./supabase";

const HIGGSFIELD_API_BASE = "https://fnf.higgsfield.ai";
const MCP_TOKEN_URL = "https://mcp.higgsfield.ai/oauth2/token";
const MCP_CLIENT_ID = "M1DkV4hbpsSrgjfW";

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
  api_key: string;
  access_token: string | null;
  refresh_token: string | null;
  user_id: string;
  workspace_id: string;
}

async function getAuth(): Promise<HiggsFieldAuth> {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  if (!apiKey) {
    throw new Error(
      "HIGGSFIELD_API_KEY environment variable not set."
    );
  }

  const { data } = await getSupabaseAdmin()
    .from("app_settings")
    .select("higgsfield_user_id, higgsfield_workspace_id, higgsfield_access_token, higgsfield_refresh_token, higgsfield_token_updated_at")
    .limit(1)
    .single();

  if (!data?.higgsfield_user_id || !data?.higgsfield_workspace_id) {
    throw new Error(
      "Higgsfield not connected. Go to Settings and connect your account."
    );
  }

  return {
    api_key: apiKey,
    access_token: data.higgsfield_access_token || null,
    refresh_token: data.higgsfield_refresh_token || null,
    user_id: data.higgsfield_user_id,
    workspace_id: data.higgsfield_workspace_id,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(MCP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: MCP_CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Token refresh failed (${res.status}): ${errText}. Reconnect Higgsfield in Settings.`
    );
  }

  const data = await res.json();
  const newAccessToken: string = data.access_token;
  const newRefreshToken: string | undefined = data.refresh_token;

  const updateData: Record<string, string> = {
    higgsfield_access_token: newAccessToken,
    higgsfield_token_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (newRefreshToken) {
    updateData.higgsfield_refresh_token = newRefreshToken;
  }

  await getSupabaseAdmin()
    .from("app_settings")
    .update(updateData)
    .not("id", "is", null);

  return newAccessToken;
}

async function getMcpAccessToken(): Promise<string> {
  const auth = await getAuth();

  if (!auth.refresh_token) {
    throw new Error(
      "Higgsfield not connected for generation. Go to Settings and click 'Connect Higgsfield'."
    );
  }

  return refreshAccessToken(auth.refresh_token);
}

function buildHeaders(auth: HiggsFieldAuth): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.api_key}`,
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
      "Higgsfield API key invalid. Check HIGGSFIELD_API_KEY environment variable."
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
  const mediaId = data.id;
  const uploadUrl = data.upload_url;

  if (!mediaId) {
    throw new Error(
      `Image upload returned no media ID: ${JSON.stringify(data)}`
    );
  }

  if (uploadUrl) {
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: uint8,
    });

    if (!putRes.ok) {
      throw new Error(
        `Failed to PUT image to S3 (${putRes.status}): ${await putRes.text()}`
      );
    }
  }

  const confirmRes = await apiCall(
    `/developer/v2alpha/media/${mediaId}/confirm?type=image`,
    { method: "POST" }
  );

  if (!confirmRes.ok) {
    const errText = await confirmRes.text();
    throw new Error(`Media confirm failed (${confirmRes.status}): ${errText}`);
  }

  return mediaId;
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
      images: mediaIds.map((mid) => ({ id: mid, type: "media_input" })),
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

export async function generateWithReference(
  soulId: string,
  referenceImageBuffer: Buffer,
  referenceImageName: string,
  prompt: string
): Promise<GenerationResult> {
  // Upload reference image to Higgsfield
  const mediaId = await uploadImage(referenceImageBuffer, referenceImageName);

  const accessToken = await getMcpAccessToken();
  const auth = await getAuth();

  const mcpRes = await fetch("https://mcp.higgsfield.ai/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "X-Fnf-Surface": "mcp",
      "X-Fnf-User-Id": auth.user_id,
      "X-Fnf-Workspace-Id": auth.workspace_id,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      id: Date.now(),
      params: {
        name: "generate_image",
        arguments: {
          params: {
            model: "soul_2",
            prompt,
            count: 1,
            soul_id: soulId,
            aspect_ratio: "3:4",
            image: { id: mediaId, type: "media_input" },
          },
        },
      },
    }),
  });

  const text = await mcpRes.text();
  const dataLine = text.split("\n").find((l: string) => l.startsWith("data: "));
  if (!dataLine) {
    throw new Error(`MCP returned no data: ${text.slice(0, 500)}`);
  }

  const parsed = JSON.parse(dataLine.slice(6));
  const content = parsed?.result?.content;
  const structured = parsed?.result?.structuredContent;

  if (parsed?.result?.isError) {
    const errMsg = structured?.error || content?.[0]?.text || "Unknown error";
    if (errMsg.includes("Invalid or expired token")) {
      throw new Error(
        "Higgsfield auth expired. Go to Settings and reconnect Higgsfield."
      );
    }
    throw new Error(`Generation failed: ${errMsg}`);
  }

  const results = structured?.results || [];
  if (results.length > 0) {
    const job = results[0];
    return {
      jobId: job.id,
      status: job.status || "queued",
      images: job.status === "completed" && job.results?.rawUrl
        ? [job.results.rawUrl]
        : [],
    };
  }

  const textContent = (content || [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("\n");

  const jobIdMatch = textContent.match(
    /(?:job_id|id)[":\s]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );

  if (jobIdMatch) {
    return {
      jobId: jobIdMatch[1],
      status: "queued",
      images: [],
    };
  }

  throw new Error(
    `Could not parse generation response: ${textContent.slice(0, 500)}`
  );
}

export async function generateImages(
  soulId: string,
  prompt: string,
  count: number = 4
): Promise<GenerationResult> {
  const accessToken = await getMcpAccessToken();
  const auth = await getAuth();

  const mcpRes = await fetch("https://mcp.higgsfield.ai/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "X-Fnf-Surface": "mcp",
      "X-Fnf-User-Id": auth.user_id,
      "X-Fnf-Workspace-Id": auth.workspace_id,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      id: Date.now(),
      params: {
        name: "generate_image",
        arguments: {
          params: {
            model: "soul_2",
            prompt,
            count: Math.min(count, 4),
            soul_id: soulId,
            aspect_ratio: "3:4",
          },
        },
      },
    }),
  });

  const text = await mcpRes.text();
  const dataLine = text.split("\n").find((l: string) => l.startsWith("data: "));
  if (!dataLine) {
    throw new Error(`MCP returned no data: ${text.slice(0, 500)}`);
  }

  const parsed = JSON.parse(dataLine.slice(6));
  const content = parsed?.result?.content;
  const structured = parsed?.result?.structuredContent;

  if (parsed?.result?.isError) {
    const errMsg = structured?.error || content?.[0]?.text || "Unknown error";
    if (errMsg.includes("Invalid or expired token")) {
      throw new Error(
        "Higgsfield auth expired. Go to Settings and reconnect Higgsfield."
      );
    }
    throw new Error(`Generation failed: ${errMsg}`);
  }

  const results = structured?.results || [];
  if (results.length > 0) {
    const job = results[0];
    return {
      jobId: job.id,
      status: job.status || "queued",
      images: job.status === "completed" && job.results?.rawUrl
        ? [job.results.rawUrl]
        : [],
    };
  }

  const textContent = (content || [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("\n");

  const jobIdMatch = textContent.match(
    /(?:job_id|id)[":\s]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );

  if (jobIdMatch) {
    return {
      jobId: jobIdMatch[1],
      status: "queued",
      images: [],
    };
  }

  throw new Error(
    `Could not parse generation response: ${textContent.slice(0, 500)}`
  );
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
  const images: string[] = [];
  if (data.result_url) images.push(data.result_url);
  if (data.result_json?.images) images.push(...data.result_json.images);

  return {
    jobId: data.id || data.job_id || data.jobId,
    status: data.status,
    images: images.length > 0 ? images : (data.images || data.output_urls || []),
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
