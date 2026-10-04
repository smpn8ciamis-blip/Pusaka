-- Fix the security definer view issue
DROP VIEW IF EXISTS public.school_settings_public;

-- Recreate view without security definer (it's just a regular view)
CREATE VIEW public.school_settings_public AS
SELECT 
  id,
  school_name,
  district_name,
  school_address,
  school_phone,
  logo_url,
  right_logo_url,
  app_name,
  academic_year,
  active_semester,
  show_address,
  show_phone
FROM public.school_settings;

-- Grant access properly
GRANT SELECT ON public.school_settings_public TO anon, authenticated;

-- Fix the two functions with mutable search paths
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;