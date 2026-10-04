CREATE OR REPLACE VIEW public.school_settings_public AS
SELECT 
  id, school_name, district_name, logo_url, right_logo_url, 
  academic_year, active_semester, app_name, show_address, show_phone,
  enable_student_status_check, student_status_check_text, student_status_check_color,
  enable_graduation_check, graduation_check_text, graduation_check_color,
  enable_complaint_channel, complaint_channel_text, complaint_channel_color,
  enable_complaint_status_check, complaint_status_check_text, complaint_status_check_color,
  enable_activity_permission, activity_permission_text, activity_permission_color,
  enable_captcha
FROM public.school_settings;