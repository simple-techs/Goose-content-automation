-- Add pending_approval status to personas
ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_status_check;
ALTER TABLE personas ADD CONSTRAINT personas_status_check
  CHECK (status IN ('pending', 'onboarding', 'pending_approval', 'active', 'error'));

-- Table to store preview images for soul ID approval
CREATE TABLE IF NOT EXISTS approval_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  approved BOOLEAN DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_images_persona ON approval_images(persona_id);
