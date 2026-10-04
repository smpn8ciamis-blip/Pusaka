-- Add RLS policy for tata_usaha to view classes
CREATE POLICY "Tata Usaha can view classes" 
ON public.classes 
FOR SELECT 
USING (has_role(auth.uid(), 'tata_usaha'::app_role));