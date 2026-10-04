-- Add public SELECT policy for school_settings to allow access code verification
CREATE POLICY "Public can read access code from school_settings" 
ON public.school_settings 
FOR SELECT 
USING (true);