-- Drop the incorrect policy
DROP POLICY IF EXISTS "Public can read access code from school_settings" ON public.school_settings;

-- The existing "Anon can view public school settings" policy should work, but let's verify RLS is enabled
-- and add a more permissive policy that covers both anon and public roles
CREATE POLICY "Anyone can read school settings" 
ON public.school_settings 
FOR SELECT 
TO anon, public
USING (true);