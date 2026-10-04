-- Remove the overly permissive public policy that exposes all profile data
DROP POLICY IF EXISTS "Anyone can view profiles for status check" ON public.profiles;

-- Create a more restrictive policy for teachers to view other teachers' profiles (needed for document generation)
CREATE POLICY "Teachers can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'teacher'::app_role));