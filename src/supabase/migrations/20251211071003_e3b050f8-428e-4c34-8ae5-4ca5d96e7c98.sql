-- Drop overly permissive profile viewing policies
DROP POLICY IF EXISTS "Teachers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Bendahara can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Tata Usaha can view profiles" ON public.profiles;

-- Keep only:
-- 1. Users can view their own profile (already exists)
-- 2. Admins can view all profiles (already exists)
-- 3. Users can update their own profile (already exists)

-- For operational needs (e.g., displaying teacher names), the system should:
-- - Use the teachers table joined with profiles for teacher display names
-- - Or create a view that exposes only necessary non-sensitive fields

-- Create a public view for minimal profile info (just names, no contact details)
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT 
  id,
  full_name
FROM public.profiles;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;

-- Add comment explaining the security model
COMMENT ON TABLE public.profiles IS 'User profiles with sensitive contact data. Only admins can see all profiles; other users can only see their own profile. Use profiles_public view for displaying names without exposing contact info.';