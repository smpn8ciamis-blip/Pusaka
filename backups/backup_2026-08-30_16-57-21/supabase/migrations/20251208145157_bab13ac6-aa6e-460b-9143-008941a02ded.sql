-- Fix Security Definer View issue by recreating school_settings_public view with SECURITY INVOKER
DROP VIEW IF EXISTS public.school_settings_public;

CREATE VIEW public.school_settings_public 
WITH (security_invoker = true)
AS
SELECT 
  id,
  school_name,
  district_name,
  logo_url,
  right_logo_url,
  academic_year,
  active_semester,
  app_name,
  show_address,
  show_phone,
  enable_student_status_check,
  student_status_check_text,
  student_status_check_color,
  enable_graduation_check,
  graduation_check_text,
  graduation_check_color,
  enable_complaint_channel,
  complaint_channel_text,
  complaint_channel_color,
  enable_complaint_status_check,
  complaint_status_check_text,
  complaint_status_check_color,
  enable_activity_permission,
  activity_permission_text,
  activity_permission_color
FROM public.school_settings;

-- Grant select access to public view
GRANT SELECT ON public.school_settings_public TO anon, authenticated;

-- Fix function search_path for generate_report_serial
CREATE OR REPLACE FUNCTION public.generate_report_serial()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  serial text;
  exists boolean;
BEGIN
  LOOP
    serial := TO_CHAR(NOW(), 'YYYY-MM-') || LPAD(FLOOR(RANDOM() * 100000)::text, 5, '0');
    SELECT EXISTS(SELECT 1 FROM public.verified_reports WHERE serial_number = serial) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN serial;
END;
$function$;

-- Fix function search_path for update_updated_at_column (already has it but ensure it's set)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;