-- Create storage bucket for school logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-logos', 'school-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for school logos
CREATE POLICY "Anyone can view school logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'school-logos');

CREATE POLICY "Admins can upload school logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'school-logos' 
  AND (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
);

CREATE POLICY "Admins can update school logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'school-logos' 
  AND (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
);

CREATE POLICY "Admins can delete school logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'school-logos' 
  AND (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
);

-- Add logo_url column to school_settings
ALTER TABLE public.school_settings
ADD COLUMN IF NOT EXISTS logo_url TEXT;