-- Add district name to school_settings
ALTER TABLE public.school_settings
ADD COLUMN IF NOT EXISTS district_name TEXT;