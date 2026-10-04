-- Kesiswaan can view school settings
CREATE POLICY "Kesiswaan can view school settings"
ON public.school_settings
FOR SELECT
USING (has_role(auth.uid(), 'kesiswaan'::app_role));