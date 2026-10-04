
-- Add photo_url column to teachers table
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Create dedicated storage bucket for photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('student-photos', 'student-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for student-photos bucket
CREATE POLICY "Student photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'student-photos');

CREATE POLICY "Authenticated users can upload student photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'student-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update student photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'student-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete student photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'student-photos' AND auth.role() = 'authenticated');
