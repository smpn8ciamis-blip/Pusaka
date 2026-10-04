-- Allow public (anon) reads for *public-only* school settings fields via column-level privileges.
-- This fixes /layanan-publik while preventing anon from reading sensitive columns like headmaster_name.

-- Ensure RLS is enabled (should already be)
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

-- Revoke broad privileges, then re-grant only the columns exposed by the public view.
REVOKE ALL ON TABLE public.school_settings FROM anon;

GRANT SELECT (
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
  student_status_check_text,
  student_status_check_color,
  enable_activity_permission,
  activity_permission_text,
  activity_permission_color,
  enable_graduation_check,
  graduation_check_text,
  graduation_check_color,
  enable_complaint_channel,
  complaint_channel_text,
  complaint_channel_color,
  enable_complaint_status_check,
  complaint_status_check_text,
  complaint_status_check_color
) ON TABLE public.school_settings TO anon;

-- Policy: allow anon role to SELECT rows (columns are still restricted by the GRANT above).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='school_settings'
      AND policyname='Anon can view public school settings'
  ) THEN
    CREATE POLICY "Anon can view public school settings"
    ON public.school_settings
    FOR SELECT
    TO anon
    USING (true);
  END IF;
END $$;
