-- Add SELECT policies for tata_usaha on rkas_documents
CREATE POLICY "Tata Usaha can view RKAS documents"
ON public.rkas_documents
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add SELECT policies for tata_usaha on rkas_items
CREATE POLICY "Tata Usaha can view RKAS items"
ON public.rkas_items
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));