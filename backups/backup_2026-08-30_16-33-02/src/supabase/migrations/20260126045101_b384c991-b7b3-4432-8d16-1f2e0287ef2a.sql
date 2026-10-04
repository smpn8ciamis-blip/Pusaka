-- Create a function to get app_name publicly (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_app_name()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(app_name, 'Sistem Manajemen Sekolah')
  FROM public.school_settings
  ORDER BY created_at DESC
  LIMIT 1;
$$;