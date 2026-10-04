-- Drop existing view and recreate with security_invoker=on
DROP VIEW IF EXISTS public.school_settings_public;

-- Create view with security_invoker to allow RLS bypass properly
CREATE VIEW public.school_settings_public
WITH (security_invoker=off) AS
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
FROM public.school_settings
ORDER BY created_at DESC
LIMIT 1;

-- Grant SELECT on the view to both anon and authenticated roles
GRANT SELECT ON public.school_settings_public TO anon;
GRANT SELECT ON public.school_settings_public TO authenticated;