-- ============================================================
-- Penanggung jawab (Penjab) Standar Nasional Pendidikan
--
-- 8 standar: SKL, Isi, Proses, Penilaian, PTK, Sarpras, Pengelolaan, Pembiayaan.
-- Admin menugaskan >1 guru per standar. Guru penjab (role tetap 'teacher')
-- melihat standar yang ditugaskan kepadanya.
--
--  * snp_standards        : daftar 8 standar (baku)
--  * snp_assignments      : penugasan guru -> standar
--  * snp_subtasks         : sub tugas per standar (tab, dibuat admin)
--  * snp_doc_categories / snp_doc_types : kategori & jenis dokumen (admin)
--  * snp_documents        : berkas (admin & penjab), file di bucket 'snp-documents'
--  * snp_rka_batches / snp_rka_items : hasil import RKA per standar
-- ============================================================

-- ------------------------------------------------------------
-- Tabel
-- ------------------------------------------------------------
CREATE TABLE public.snp_standards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO public.snp_standards (code, name, sort_order) VALUES
  ('skl',          'Standar Kompetensi Lulusan (SKL)',              1),
  ('isi',          'Standar Isi',                                    2),
  ('proses',       'Standar Proses',                                 3),
  ('penilaian',    'Standar Penilaian Pendidikan',                   4),
  ('ptk',          'Standar Pendidik dan Tenaga Kependidikan',       5),
  ('sarpras',      'Standar Sarana dan Prasarana',                   6),
  ('pengelolaan',  'Standar Pengelolaan',                            7),
  ('pembiayaan',   'Standar Pembiayaan',                             8);

CREATE TABLE public.snp_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  standard_id uuid NOT NULL REFERENCES public.snp_standards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (standard_id, user_id)
);

CREATE TABLE public.snp_subtasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  standard_id uuid NOT NULL REFERENCES public.snp_standards(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'belum' CHECK (status IN ('belum', 'proses', 'selesai')),
  progress_note text,
  school_id uuid REFERENCES public.schools(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.snp_doc_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  school_id uuid REFERENCES public.schools(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.snp_doc_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.snp_doc_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  school_id uuid REFERENCES public.schools(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.snp_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  standard_id uuid NOT NULL REFERENCES public.snp_standards(id) ON DELETE CASCADE,
  subtask_id uuid REFERENCES public.snp_subtasks(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.snp_doc_categories(id) ON DELETE SET NULL,
  type_id uuid REFERENCES public.snp_doc_types(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid DEFAULT auth.uid(),
  uploader_name text,
  from_admin boolean NOT NULL DEFAULT false,
  school_id uuid REFERENCES public.schools(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.snp_rka_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  standard_id uuid NOT NULL REFERENCES public.snp_standards(id) ON DELETE CASCADE,
  fiscal_year text,
  file_name text,
  row_count integer NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  imported_by uuid DEFAULT auth.uid(),
  school_id uuid REFERENCES public.schools(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.snp_rka_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.snp_rka_batches(id) ON DELETE CASCADE,
  standard_id uuid NOT NULL REFERENCES public.snp_standards(id) ON DELETE CASCADE,
  line_no integer,
  activity_name text NOT NULL,
  description text,
  volume numeric NOT NULL DEFAULT 0,
  unit text,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  months integer[] NOT NULL DEFAULT '{}',
  month_label text,
  school_id uuid REFERENCES public.schools(id)
);

CREATE INDEX idx_snp_assign_user ON public.snp_assignments(user_id);
CREATE INDEX idx_snp_assign_std ON public.snp_assignments(standard_id);
CREATE INDEX idx_snp_subtasks_std ON public.snp_subtasks(standard_id, sort_order);
CREATE INDEX idx_snp_docs_std ON public.snp_documents(standard_id, created_at DESC);
CREATE INDEX idx_snp_docs_subtask ON public.snp_documents(subtask_id);
CREATE INDEX idx_snp_rka_batches_std ON public.snp_rka_batches(standard_id, created_at DESC);
CREATE INDEX idx_snp_rka_items_batch ON public.snp_rka_items(batch_id);
CREATE INDEX idx_snp_rka_items_std ON public.snp_rka_items(standard_id);

-- ------------------------------------------------------------
-- Fungsi bantu
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_snp_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR public.is_super_admin()
$$;

CREATE OR REPLACE FUNCTION public.is_snp_penjab(_standard_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.snp_assignments a
    WHERE a.user_id = auth.uid() AND a.standard_id = _standard_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_snp_any_penjab()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.snp_assignments a WHERE a.user_id = auth.uid())
$$;

-- Path storage: {school_id}/{standard_id}/{file}
CREATE OR REPLACE FUNCTION public.snp_can_access_path(_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN split_part(_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.is_snp_admin() OR public.is_snp_penjab(split_part(_name, '/', 2)::uuid)
    ELSE false
  END
$$;

-- ------------------------------------------------------------
-- Trigger
-- ------------------------------------------------------------
CREATE TRIGGER auto_set_school_id_snp_assignments BEFORE INSERT ON public.snp_assignments
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_snp_subtasks BEFORE INSERT ON public.snp_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_snp_doc_categories BEFORE INSERT ON public.snp_doc_categories
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_snp_doc_types BEFORE INSERT ON public.snp_doc_types
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_snp_documents BEFORE INSERT ON public.snp_documents
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_snp_rka_batches BEFORE INSERT ON public.snp_rka_batches
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_snp_rka_items BEFORE INSERT ON public.snp_rka_items
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

CREATE TRIGGER update_snp_subtasks_updated_at BEFORE UPDATE ON public.snp_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Nama pengunggah & penanda unggahan admin diisi server, tidak bisa dipalsukan klien
CREATE OR REPLACE FUNCTION public.snp_set_document_meta()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.uploaded_by := COALESCE(auth.uid(), NEW.uploaded_by);
  SELECT p.full_name INTO NEW.uploader_name FROM public.profiles p WHERE p.id = NEW.uploaded_by;
  NEW.from_admin := public.is_snp_admin();
  RETURN NEW;
END;
$$;
CREATE TRIGGER snp_set_document_meta_trg BEFORE INSERT ON public.snp_documents
  FOR EACH ROW EXECUTE FUNCTION public.snp_set_document_meta();

-- ------------------------------------------------------------
-- Grants + RLS
-- ------------------------------------------------------------
GRANT SELECT ON public.snp_standards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.snp_assignments, public.snp_subtasks, public.snp_doc_categories,
  public.snp_doc_types, public.snp_documents, public.snp_rka_batches, public.snp_rka_items
TO authenticated;
GRANT ALL ON
  public.snp_standards, public.snp_assignments, public.snp_subtasks, public.snp_doc_categories,
  public.snp_doc_types, public.snp_documents, public.snp_rka_batches, public.snp_rka_items
TO service_role;

ALTER TABLE public.snp_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snp_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snp_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snp_doc_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snp_doc_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snp_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snp_rka_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snp_rka_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snp_standards_select" ON public.snp_standards
  FOR SELECT TO authenticated USING (true);

-- Isolasi antar sekolah
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['snp_assignments','snp_subtasks','snp_doc_categories','snp_doc_types',
                           'snp_documents','snp_rka_batches','snp_rka_items']
  LOOP
    EXECUTE format($f$
      CREATE POLICY "school_isolation_%1$s" ON public.%1$s
        AS RESTRICTIVE FOR ALL TO authenticated
        USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
        WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
    $f$, t);
  END LOOP;
END $$;

-- assignments
CREATE POLICY "snp_assignments_select" ON public.snp_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_snp_admin() OR public.is_snp_penjab(standard_id));
CREATE POLICY "snp_assignments_admin_write" ON public.snp_assignments
  FOR ALL TO authenticated
  USING (public.is_snp_admin()) WITH CHECK (public.is_snp_admin());

-- subtasks (progres diperbarui penjab lewat RPC)
CREATE POLICY "snp_subtasks_select" ON public.snp_subtasks
  FOR SELECT TO authenticated
  USING (public.is_snp_admin() OR public.is_snp_penjab(standard_id));
CREATE POLICY "snp_subtasks_admin_write" ON public.snp_subtasks
  FOR ALL TO authenticated
  USING (public.is_snp_admin()) WITH CHECK (public.is_snp_admin());

-- kategori & jenis dokumen: admin kelola, penjab melihat
CREATE POLICY "snp_doc_categories_select" ON public.snp_doc_categories
  FOR SELECT TO authenticated
  USING (public.is_snp_admin() OR public.is_snp_any_penjab());
CREATE POLICY "snp_doc_categories_admin_write" ON public.snp_doc_categories
  FOR ALL TO authenticated
  USING (public.is_snp_admin()) WITH CHECK (public.is_snp_admin());
CREATE POLICY "snp_doc_types_select" ON public.snp_doc_types
  FOR SELECT TO authenticated
  USING (public.is_snp_admin() OR public.is_snp_any_penjab());
CREATE POLICY "snp_doc_types_admin_write" ON public.snp_doc_types
  FOR ALL TO authenticated
  USING (public.is_snp_admin()) WITH CHECK (public.is_snp_admin());

-- documents
CREATE POLICY "snp_documents_select" ON public.snp_documents
  FOR SELECT TO authenticated
  USING (public.is_snp_admin() OR public.is_snp_penjab(standard_id));
CREATE POLICY "snp_documents_insert" ON public.snp_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_snp_admin() OR public.is_snp_penjab(standard_id));
CREATE POLICY "snp_documents_update" ON public.snp_documents
  FOR UPDATE TO authenticated
  USING (public.is_snp_admin() OR (uploaded_by = auth.uid() AND public.is_snp_penjab(standard_id)))
  WITH CHECK (public.is_snp_admin() OR (uploaded_by = auth.uid() AND public.is_snp_penjab(standard_id)));
CREATE POLICY "snp_documents_delete" ON public.snp_documents
  FOR DELETE TO authenticated
  USING (public.is_snp_admin() OR (uploaded_by = auth.uid() AND public.is_snp_penjab(standard_id)));

-- RKA
CREATE POLICY "snp_rka_batches_select" ON public.snp_rka_batches
  FOR SELECT TO authenticated
  USING (public.is_snp_admin() OR public.is_snp_penjab(standard_id));
CREATE POLICY "snp_rka_batches_write" ON public.snp_rka_batches
  FOR ALL TO authenticated
  USING (public.is_snp_admin() OR public.is_snp_penjab(standard_id))
  WITH CHECK (public.is_snp_admin() OR public.is_snp_penjab(standard_id));
CREATE POLICY "snp_rka_items_select" ON public.snp_rka_items
  FOR SELECT TO authenticated
  USING (public.is_snp_admin() OR public.is_snp_penjab(standard_id));
CREATE POLICY "snp_rka_items_write" ON public.snp_rka_items
  FOR ALL TO authenticated
  USING (public.is_snp_admin() OR public.is_snp_penjab(standard_id))
  WITH CHECK (public.is_snp_admin() OR public.is_snp_penjab(standard_id));

-- ------------------------------------------------------------
-- RPC
-- ------------------------------------------------------------
-- Guru yang bisa ditugaskan (admin)
CREATE OR REPLACE FUNCTION public.snp_list_teachers()
RETURNS TABLE (user_id uuid, full_name text, nip text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.user_id, p.full_name, t.nip
  FROM public.teachers t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE (t.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND public.is_snp_admin()
  ORDER BY p.full_name
$$;

-- Penjab per standar beserta nama (admin & sesama penjab)
CREATE OR REPLACE FUNCTION public.snp_get_assignments()
RETURNS TABLE (id uuid, standard_id uuid, user_id uuid, full_name text, nip text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.standard_id, a.user_id, p.full_name, t.nip
  FROM public.snp_assignments a
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.teachers t ON t.user_id = a.user_id
  WHERE (a.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (public.is_snp_admin() OR public.is_snp_penjab(a.standard_id))
  ORDER BY p.full_name
$$;

-- Penjab memperbarui status & catatan progres sub tugasnya
CREATE OR REPLACE FUNCTION public.snp_update_subtask_progress(_id uuid, _status text, _note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_std uuid;
BEGIN
  IF _status NOT IN ('belum', 'proses', 'selesai') THEN
    RAISE EXCEPTION 'Status tidak valid';
  END IF;
  SELECT standard_id INTO v_std FROM public.snp_subtasks
   WHERE id = _id AND (school_id = public.get_user_school_id() OR public.is_super_admin());
  IF v_std IS NULL THEN RAISE EXCEPTION 'Sub tugas tidak ditemukan'; END IF;
  IF NOT (public.is_snp_admin() OR public.is_snp_penjab(v_std)) THEN
    RAISE EXCEPTION 'Tidak berwenang';
  END IF;
  UPDATE public.snp_subtasks
     SET status = _status, progress_note = NULLIF(btrim(_note), '')
   WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.snp_list_teachers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.snp_get_assignments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.snp_update_subtask_progress(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snp_list_teachers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.snp_get_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.snp_update_subtask_progress(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------
-- Storage: bucket privat 'snp-documents'
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('snp-documents', 'snp-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "snp documents select" ON storage.objects;
CREATE POLICY "snp documents select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'snp-documents'
    AND (
      public.is_super_admin()
      OR (split_part(name, '/', 1) = public.get_user_school_id()::text AND public.snp_can_access_path(name))
    )
  );

DROP POLICY IF EXISTS "snp documents insert" ON storage.objects;
CREATE POLICY "snp documents insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'snp-documents'
    AND split_part(name, '/', 1) = public.get_user_school_id()::text
    AND public.snp_can_access_path(name)
  );

DROP POLICY IF EXISTS "snp documents delete" ON storage.objects;
CREATE POLICY "snp documents delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'snp-documents'
    AND split_part(name, '/', 1) = public.get_user_school_id()::text
    AND (public.is_snp_admin() OR (owner = auth.uid() AND public.snp_can_access_path(name)))
  );
