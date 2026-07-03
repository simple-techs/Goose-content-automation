-- Add Google OAuth fields to app_settings
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS google_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_email text,
  ADD COLUMN IF NOT EXISTS google_connected_at timestamptz;
