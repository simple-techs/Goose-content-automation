-- Add image_type column to track selfie/shirtless/lifestyle per generation job
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS image_type text DEFAULT 'general';
