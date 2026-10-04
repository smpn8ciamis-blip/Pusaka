-- ============================================================
-- Migrasi: Dokumentasi Narasumber
-- Jalankan di Supabase SQL Editor atau via psql
-- ============================================================

CREATE TABLE IF NOT EXISTS narasumber_documentation (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  honorarium_id UUID REFERENCES narasumber_honorariums(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  caption TEXT,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_narasumber_doc_honorarium
  ON narasumber_documentation(honorarium_id);

ALTER TABLE narasumber_documentation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users can view narasumber docs" ON narasumber_documentation;
CREATE POLICY "Auth users can view narasumber docs"
  ON narasumber_documentation FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth users can insert narasumber docs" ON narasumber_documentation;
CREATE POLICY "Auth users can insert narasumber docs"
  ON narasumber_documentation FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth users can update narasumber docs" ON narasumber_documentation;
CREATE POLICY "Auth users can update narasumber docs"
  ON narasumber_documentation FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth users can delete narasumber docs" ON narasumber_documentation;
CREATE POLICY "Auth users can delete narasumber docs"
  ON narasumber_documentation FOR DELETE
  USING (auth.role() = 'authenticated');

INSERT INTO storage.buckets (id, name, public)
VALUES ('narasumber-documentation', 'narasumber-documentation', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view narasumber docs" ON storage.objects;
CREATE POLICY "Public can view narasumber docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'narasumber-documentation');

DROP POLICY IF EXISTS "Auth users can upload narasumber docs" ON storage.objects;
CREATE POLICY "Auth users can upload narasumber docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'narasumber-documentation' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth users can update narasumber docs" ON storage.objects;
CREATE POLICY "Auth users can update narasumber docs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'narasumber-documentation' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth users can delete narasumber docs" ON storage.objects;
CREATE POLICY "Auth users can delete narasumber docs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'narasumber-documentation' AND auth.role() = 'authenticated');
