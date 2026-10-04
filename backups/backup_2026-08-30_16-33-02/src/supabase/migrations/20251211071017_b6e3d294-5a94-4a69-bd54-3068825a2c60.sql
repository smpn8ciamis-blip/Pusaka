-- Drop the security definer view and recreate with SECURITY INVOKER
DROP VIEW IF EXISTS public.profiles_public;

-- Create view with SECURITY INVOKER (default, but explicit for clarity)
CREATE VIEW public.profiles_public 
WITH (security_invoker = true)
AS
SELECT 
  id,
  full_name
FROM public.profiles;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;