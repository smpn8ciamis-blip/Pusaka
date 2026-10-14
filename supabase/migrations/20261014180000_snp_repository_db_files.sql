-- Repositori Penjab: berkas disimpan langsung di database (potongan base64) sehingga TIDAK
-- melewati storage.objects (yang diblokir trigger validate_file_trigger -> error P0001).
-- Dokumen lama di bucket 'snp-documents' tetap dapat diunduh.

ALTER TABLE public.snp_documents
  ADD COLUMN IF NOT EXISTS storage_kind text NOT NULL DEFAULT 'bucket',   -- 'bucket' | 'db'
  ADD COLUMN IF NOT EXISTS chunk_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ready boolean NOT NULL DEFAULT true;            -- false selama potongan berkas belum lengkap

CREATE TABLE IF NOT EXISTS public.snp_file_chunks (
  document_id uuid NOT NULL REFERENCES public.snp_documents(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  data text NOT NULL,
  standard_id uuid NOT NULL REFERENCES public.snp_standards(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id),
  PRIMARY KEY (document_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_snp_file_chunks_std ON public.snp_file_chunks(standard_id);

DROP TRIGGER IF EXISTS auto_set_school_id_snp_file_chunks ON public.snp_file_chunks;
CREATE TRIGGER auto_set_school_id_snp_file_chunks BEFORE INSERT ON public.snp_file_chunks
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

GRANT SELECT, INSERT, DELETE ON public.snp_file_chunks TO authenticated;
GRANT ALL ON public.snp_file_chunks TO service_role;
ALTER TABLE public.snp_file_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_isolation_snp_file_chunks" ON public.snp_file_chunks;
CREATE POLICY "school_isolation_snp_file_chunks" ON public.snp_file_chunks
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "snp_file_chunks_select" ON public.snp_file_chunks;
CREATE POLICY "snp_file_chunks_select" ON public.snp_file_chunks
  FOR SELECT TO authenticated
  USING (public.is_snp_admin() OR public.is_snp_penjab(standard_id));

-- Hanya pengunggah dokumen (atau admin) yang boleh menambah potongan, dan standarnya harus sama dengan dokumen.
DROP POLICY IF EXISTS "snp_file_chunks_insert" ON public.snp_file_chunks;
CREATE POLICY "snp_file_chunks_insert" ON public.snp_file_chunks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.snp_documents d
      WHERE d.id = document_id
        AND d.standard_id = snp_file_chunks.standard_id
        AND (public.is_snp_admin() OR (d.uploaded_by = auth.uid() AND public.is_snp_penjab(d.standard_id)))
    )
  );

DROP POLICY IF EXISTS "snp_file_chunks_delete" ON public.snp_file_chunks;
CREATE POLICY "snp_file_chunks_delete" ON public.snp_file_chunks
  FOR DELETE TO authenticated
  USING (public.is_snp_admin() OR public.is_snp_penjab(standard_id));
