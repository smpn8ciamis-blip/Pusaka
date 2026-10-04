-- Add font style settings for district name
ALTER TABLE public.school_settings
ADD COLUMN IF NOT EXISTS district_font_size INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS district_font_style TEXT DEFAULT 'bold';