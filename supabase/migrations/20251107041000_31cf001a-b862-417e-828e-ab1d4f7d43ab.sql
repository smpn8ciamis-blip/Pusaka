-- Add second logo (right side) settings
ALTER TABLE public.school_settings
ADD COLUMN IF NOT EXISTS right_logo_url TEXT,
ADD COLUMN IF NOT EXISTS right_logo_width INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS right_logo_height INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS right_logo_position_x INTEGER DEFAULT 176,
ADD COLUMN IF NOT EXISTS right_logo_position_y INTEGER DEFAULT 15;