-- Add custom text and color columns for public portal buttons
ALTER TABLE public.school_settings
ADD COLUMN student_status_check_text TEXT DEFAULT 'Cek Status Peserta Didik',
ADD COLUMN student_status_check_color TEXT DEFAULT 'default',
ADD COLUMN activity_permission_text TEXT DEFAULT 'Portal Izin Kegiatan Siswa',
ADD COLUMN activity_permission_color TEXT DEFAULT 'default',
ADD COLUMN graduation_check_text TEXT DEFAULT 'Cek Status Kelulusan',
ADD COLUMN graduation_check_color TEXT DEFAULT 'default',
ADD COLUMN complaint_channel_text TEXT DEFAULT 'Kanal Pengaduan',
ADD COLUMN complaint_channel_color TEXT DEFAULT 'destructive',
ADD COLUMN complaint_status_check_text TEXT DEFAULT 'Cek Status Pengaduan',
ADD COLUMN complaint_status_check_color TEXT DEFAULT 'outline';

-- Update the public view to include custom text and colors
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
  enable_complaint_status_check,
  student_status_check_text,
  student_status_check_color,
  activity_permission_text,
  activity_permission_color,
  graduation_check_text,
  graduation_check_color,
  complaint_channel_text,
  complaint_channel_color,
  complaint_status_check_text,
  complaint_status_check_color
FROM public.school_settings;