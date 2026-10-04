-- Add access code field to school_settings table
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS teacher_upload_access_code TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.school_settings.teacher_upload_access_code IS 'Access code for public teacher file upload page';