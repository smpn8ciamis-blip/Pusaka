-- Allow Tata Usaha to view school settings for PDF generation
CREATE POLICY "Tata Usaha can view school settings" 
ON public.school_settings 
FOR SELECT 
USING (has_role(auth.uid(), 'tata_usaha'::app_role));