-- Add bendahara settings to school_settings table
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS bendahara_name text,
ADD COLUMN IF NOT EXISTS bendahara_nip text;