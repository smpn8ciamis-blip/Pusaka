-- Drop old tata_usaha storage policies for RKAS
DROP POLICY IF EXISTS "Tata Usaha can upload RKAS files" ON storage.objects;
DROP POLICY IF EXISTS "Tata Usaha can delete RKAS files" ON storage.objects;

-- Create new bendahara storage policies for RKAS
CREATE POLICY "Bendahara can upload RKAS files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'rkas-documents' 
  AND has_role(auth.uid(), 'bendahara'::app_role)
);

CREATE POLICY "Bendahara can delete RKAS files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'rkas-documents' 
  AND has_role(auth.uid(), 'bendahara'::app_role)
);

-- Also fix the rkas_documents table policies to include WITH CHECK
DROP POLICY IF EXISTS "Bendahara can manage RKAS documents" ON public.rkas_documents;
CREATE POLICY "Bendahara can manage RKAS documents"
ON public.rkas_documents
FOR ALL
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- Fix rkas_items table policies too
DROP POLICY IF EXISTS "Bendahara can manage RKAS items" ON public.rkas_items;
CREATE POLICY "Bendahara can manage RKAS items"
ON public.rkas_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM rkas_documents rd
    WHERE rd.id = rkas_items.rkas_id 
    AND has_role(auth.uid(), 'bendahara'::app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM rkas_documents rd
    WHERE rd.id = rkas_items.rkas_id 
    AND has_role(auth.uid(), 'bendahara'::app_role)
  )
);