-- Track usage of reference images from the "general reference" Drive folder
CREATE TABLE IF NOT EXISTS reference_image_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id text NOT NULL,
  drive_file_name text NOT NULL,
  used_by_persona_id uuid REFERENCES personas(id) ON DELETE SET NULL,
  generation_log_id uuid REFERENCES generation_logs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unused', -- unused, used, rejected (can be reused)
  created_at timestamptz DEFAULT now(),
  used_at timestamptz
);

-- Index for quick lookup of unused images
CREATE INDEX IF NOT EXISTS idx_ref_images_status ON reference_image_usage(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_images_drive_id ON reference_image_usage(drive_file_id);

-- Store the general reference folder ID in settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS general_reference_folder_id text;
