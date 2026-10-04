-- Fix: Do NOT expose school_settings table to anon/public.
-- Instead expose a SECURITY DEFINER RPC for access-code checks.

-- Remove overly permissive public policies (if they exist)
DROP POLICY IF EXISTS "Anon can view public school settings" ON public.school_settings;
DROP POLICY IF EXISTS "Anyone can read school settings" ON public.school_settings;

-- Ensure anon/public don't need direct SELECT on school_settings
REVOKE ALL ON TABLE public.school_settings FROM anon;
REVOKE ALL ON TABLE public.school_settings FROM public;

-- RPC: is access code configured?
CREATE OR REPLACE FUNCTION public.teacher_upload_access_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_settings
    WHERE teacher_upload_access_code IS NOT NULL
      AND teacher_upload_access_code <> ''
  );
$$;

-- RPC: verify access code (true when matches, false otherwise)
CREATE OR REPLACE FUNCTION public.verify_teacher_upload_access_code(_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_settings
    WHERE COALESCE(teacher_upload_access_code, '') <> ''
      AND teacher_upload_access_code = trim(_code)
  );
$$;

-- Allow anonymous callers to execute the RPCs
GRANT EXECUTE ON FUNCTION public.teacher_upload_access_required() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_teacher_upload_access_code(text) TO anon, authenticated;