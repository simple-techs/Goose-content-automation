-- Add approval_prompt column to app_settings for configuring Soul ID preview generation
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS approval_prompt text DEFAULT '';

-- Update default_prompt with the full iPhone-realistic generation parameters
UPDATE app_settings SET approval_prompt = 'Male between 18-24 years old. Dark blue jeans, grey t-shirt, standing in front of white wall background. Professional portrait photo, high quality, natural lighting.' WHERE approval_prompt = '' OR approval_prompt IS NULL;
