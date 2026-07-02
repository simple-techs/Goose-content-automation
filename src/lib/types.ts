export interface Persona {
  id: string;
  name: string;
  drive_folder_id: string;
  drive_folder_url: string;
  higgsfield_soul_id: string | null;
  status: "pending" | "onboarding" | "active" | "error";
  image_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Batch {
  id: string;
  persona_id: string;
  drive_subfolder_id: string;
  drive_subfolder_url: string;
  image_count: number;
  status: "generating" | "uploading" | "completed" | "failed";
  error_message: string | null;
  slack_notified: boolean;
  created_at: string;
}

export interface GenerationLog {
  id: string;
  batch_id: string;
  persona_id: string;
  higgsfield_job_id: string | null;
  prompt: string;
  status: "queued" | "processing" | "completed" | "failed";
  output_url: string | null;
  error_message: string | null;
  created_at: string;
}

export interface AppSettings {
  id: string;
  parent_drive_folder_id: string;
  slack_webhook_url: string | null;
  slack_channel: string | null;
  default_prompt: string;
  generation_count: number;
  cron_enabled: boolean;
  cron_day: string;
  google_refresh_token: string | null;
  google_email: string | null;
  google_connected_at: string | null;
  higgsfield_access_token: string | null;
  higgsfield_refresh_token: string | null;
  higgsfield_user_id: string | null;
  higgsfield_workspace_id: string | null;
  higgsfield_email: string | null;
  higgsfield_connected_at: string | null;
  higgsfield_token_updated_at: string | null;
  updated_at: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  thumbnailLink?: string;
}
