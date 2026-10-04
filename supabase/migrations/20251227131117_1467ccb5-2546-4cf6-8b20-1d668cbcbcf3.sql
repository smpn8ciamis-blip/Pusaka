-- Add NUPTK column to teachers table
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS nuptk text;