-- Add toggle settings for public portal buttons
ALTER TABLE public.school_settings 
ADD COLUMN enable_student_status_check BOOLEAN DEFAULT true,
ADD COLUMN enable_activity_permission BOOLEAN DEFAULT true,
ADD COLUMN enable_graduation_check BOOLEAN DEFAULT true,
ADD COLUMN enable_complaint_channel BOOLEAN DEFAULT true,
ADD COLUMN enable_complaint_status_check BOOLEAN DEFAULT true;

-- Update public view to include these settings
DROP VIEW IF EXISTS public.school_settings_public;

CREATE VIEW public.school_settings_public AS
SELECT 
  id,
  school_name,
  district_name,
  logo_url,
  right_logo_url,
  app_name,
  academic_year,
  active_semester,
  show_address,
  show_phone,
  enable_student_status_check,
  enable_activity_permission,
  enable_graduation_check,
  enable_complaint_channel,
  enable_complaint_status_check
FROM public.school_settings;