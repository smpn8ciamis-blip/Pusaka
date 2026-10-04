-- Add photo_url field to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS photo_url text;