-- Allow Tata Usaha to update bendahara fields in school_settings
CREATE POLICY "Tata Usaha can update bendahara settings"
ON public.school_settings
FOR UPDATE
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));