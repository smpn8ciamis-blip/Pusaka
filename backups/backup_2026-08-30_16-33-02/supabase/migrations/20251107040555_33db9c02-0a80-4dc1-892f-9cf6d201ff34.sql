-- Add line spacing settings for district and school name
ALTER TABLE public.school_settings
ADD COLUMN IF NOT EXISTS district_line_spacing NUMERIC DEFAULT 1.2,
ADD COLUMN IF NOT EXISTS school_line_spacing NUMERIC DEFAULT 1.2;