-- ============================================================
-- Perbaikan upload dokumen Penjab SNP (storage 500, kode P0001)
--
-- Policy storage sebelumnya memanggil fungsi kustom (snp_can_access_path)
-- dan meng-cast segmen path ke uuid di dalam policy. Policy diganti dengan
-- kondisi langsung (tanpa fungsi kustom & tanpa cast) agar tidak bergantung
-- pada fungsi/trigger lain saat Storage mengevaluasi policy.
-- Aturan akses tetap sama:
--   path = {school_id}/{standard_id}/{file}
--   admin / super admin : semua standar di sekolahnya
--   penjab              : hanya standar yang ditugaskan kepadanya
-- ============================================================

-- Bucket privat; tanpa batas mime/ukuran di level bucket (dibatasi di aplikasi)
INSERT INTO storage.buckets (id, name, public)
VALUES ('snp-documents', 'snp-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "snp documents select" ON storage.objects;
CREATE POLICY "snp documents select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'snp-documents'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = public.get_user_school_id()::text
        AND (
          public.has_role(auth.uid(), 'admin')
          OR EXISTS (
            SELECT 1 FROM public.snp_assignments a
            WHERE a.user_id = auth.uid() AND a.standard_id::text = split_part(name, '/', 2)
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "snp documents insert" ON storage.objects;
CREATE POLICY "snp documents insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'snp-documents'
    AND split_part(name, '/', 1) = public.get_user_school_id()::text
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.snp_assignments a
        WHERE a.user_id = auth.uid() AND a.standard_id::text = split_part(name, '/', 2)
      )
    )
  );

DROP POLICY IF EXISTS "snp documents delete" ON storage.objects;
CREATE POLICY "snp documents delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'snp-documents'
    AND split_part(name, '/', 1) = public.get_user_school_id()::text
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (
        owner = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.snp_assignments a
          WHERE a.user_id = auth.uid() AND a.standard_id::text = split_part(name, '/', 2)
        )
      )
    )
  );
