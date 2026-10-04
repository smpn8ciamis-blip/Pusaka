
-- Create storage bucket for letters
INSERT INTO storage.buckets (id, name, public)
VALUES ('surat-documents', 'surat-documents', true);

-- RLS policies for surat-documents bucket
CREATE POLICY "Anyone can view surat documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'surat-documents');

CREATE POLICY "Admins can upload surat documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'surat-documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tata Usaha can upload surat documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'surat-documents' AND has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Bendahara can upload surat documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'surat-documents' AND has_role(auth.uid(), 'bendahara'::app_role));

CREATE POLICY "Admins can delete surat documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'surat-documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tata Usaha can delete surat documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'surat-documents' AND has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Bendahara can delete surat documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'surat-documents' AND has_role(auth.uid(), 'bendahara'::app_role));
