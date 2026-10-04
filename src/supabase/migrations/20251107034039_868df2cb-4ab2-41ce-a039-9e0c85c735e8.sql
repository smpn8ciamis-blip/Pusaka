-- Add watermark settings to school_settings
ALTER TABLE public.school_settings
ADD COLUMN IF NOT EXISTS watermark_url TEXT,
ADD COLUMN IF NOT EXISTS watermark_opacity INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS watermark_size INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS watermark_position TEXT DEFAULT 'center',
ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN DEFAULT false;