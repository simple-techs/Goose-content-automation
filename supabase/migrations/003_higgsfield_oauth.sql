-- Add Higgsfield OAuth columns to app_settings
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS higgsfield_access_token TEXT,
  ADD COLUMN IF NOT EXISTS higgsfield_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS higgsfield_user_id TEXT,
  ADD COLUMN IF NOT EXISTS higgsfield_workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS higgsfield_email TEXT,
  ADD COLUMN IF NOT EXISTS higgsfield_connected_at TIMESTAMPTZ;
