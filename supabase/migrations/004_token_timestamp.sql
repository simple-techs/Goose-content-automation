-- Add timestamp for tracking when the Higgsfield token was last refreshed
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS higgsfield_token_updated_at TIMESTAMPTZ;
