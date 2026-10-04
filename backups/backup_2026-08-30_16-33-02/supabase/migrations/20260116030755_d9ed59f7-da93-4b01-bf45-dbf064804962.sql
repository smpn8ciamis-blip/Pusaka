-- Provide a safe, RLS-bypassing way to read letterhead settings without exposing sensitive fields
-- This function is SECURITY DEFINER, so it can read from school_settings even when the caller cannot.

CREATE OR REPLACE FUNCTION public.get_school_settings_for_letterhead()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT to_jsonb(s) - 'teacher_upload_access_code'
  FROM public.school_settings s
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

-- Lock down execution
REVOKE ALL ON FUNCTION public.get_school_settings_for_letterhead() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_settings_for_letterhead() TO authenticated;
