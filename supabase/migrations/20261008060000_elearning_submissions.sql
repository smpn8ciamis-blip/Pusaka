-- ============================================================
-- E-Learning: siswa mengumpulkan jawaban / rangkuman pada tiap materi
--   * teks dan/atau file (gambar, PDF, DOCX)
--   * satu pengumpulan per siswa per materi (boleh diganti selama belum dinilai)
--   * guru pemilik materi melihat, memberi nilai & komentar
-- Jalankan setelah 20261008030000_elearning_and_grade_visibility.sql
-- ============================================================

ALTER TABLE public.elearning_materials
  ADD COLUMN IF NOT EXISTS accepts_submissions boolean NOT NULL DEFAULT true;

-- ---- Tabel ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.elearning_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.elearning_materials(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  answer_text text,
  file_path text,
  file_name text,
  file_type text,                 -- image | pdf | docx
  mime_type text,
  file_size bigint,
  score numeric(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  teacher_feedback text,
  graded_at timestamptz,
  school_id uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (material_id, student_id),
  CHECK (answer_text IS NOT NULL OR file_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_elearning_sub_material ON public.elearning_submissions(material_id);
CREATE INDEX IF NOT EXISTS idx_elearning_sub_student ON public.elearning_submissions(student_id);

ALTER TABLE public.elearning_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elearning_submissions TO authenticated;
GRANT ALL ON public.elearning_submissions TO service_role;

DROP TRIGGER IF EXISTS auto_set_school_id_elearning_sub ON public.elearning_submissions;
CREATE TRIGGER auto_set_school_id_elearning_sub
  BEFORE INSERT ON public.elearning_submissions
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

DROP POLICY IF EXISTS "school_isolation_elearning_sub" ON public.elearning_submissions;
CREATE POLICY "school_isolation_elearning_sub" ON public.elearning_submissions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

-- ---- Helper --------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_student_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sa.student_id FROM public.student_accounts sa WHERE sa.user_id = auth.uid() LIMIT 1
$$;

-- Guru pemilik materi (lewat id materi)
CREATE OR REPLACE FUNCTION public.is_my_material(_material_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.elearning_materials m
    JOIN public.teachers t ON t.id = m.teacher_id
    WHERE m.id = _material_id AND t.user_id = auth.uid()
  )
$$;

-- Materi terbit, menerima jawaban, dan untuk kelas siswa yang login
CREATE OR REPLACE FUNCTION public.student_can_submit_to(_material_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.elearning_materials m
    WHERE m.id = _material_id
      AND m.is_published
      AND m.accepts_submissions
      AND m.class_id = public.get_my_student_class_id()
  )
$$;

-- ---- Trigger: siswa tidak boleh menyentuh nilai/komentar -----
CREATE OR REPLACE FUNCTION public.protect_elearning_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_grader boolean;
BEGIN
  v_is_grader := public.has_role(auth.uid(), 'admin')
              OR public.is_super_admin()
              OR public.is_my_material(NEW.material_id);

  IF v_is_grader THEN
    IF TG_OP = 'UPDATE' AND (NEW.score IS DISTINCT FROM OLD.score
                             OR NEW.teacher_feedback IS DISTINCT FROM OLD.teacher_feedback) THEN
      NEW.graded_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- siswa
  IF TG_OP = 'INSERT' THEN
    NEW.score := NULL;
    NEW.teacher_feedback := NULL;
    NEW.graded_at := NULL;
  ELSE
    NEW.material_id := OLD.material_id;
    NEW.student_id := OLD.student_id;
    NEW.score := OLD.score;
    NEW.teacher_feedback := OLD.teacher_feedback;
    NEW.graded_at := OLD.graded_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_elearning_submission_trg ON public.elearning_submissions;
CREATE TRIGGER protect_elearning_submission_trg
  BEFORE INSERT OR UPDATE ON public.elearning_submissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_elearning_submission();

-- ---- RLS tabel -----------------------------------------------
DROP POLICY IF EXISTS "elearning_sub_student_select" ON public.elearning_submissions;
CREATE POLICY "elearning_sub_student_select" ON public.elearning_submissions
  FOR SELECT TO authenticated
  USING (student_id = public.get_my_student_id());

DROP POLICY IF EXISTS "elearning_sub_student_insert" ON public.elearning_submissions;
CREATE POLICY "elearning_sub_student_insert" ON public.elearning_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = public.get_my_student_id()
    AND public.student_can_submit_to(material_id)
  );

-- Boleh diganti selama belum dinilai
DROP POLICY IF EXISTS "elearning_sub_student_update" ON public.elearning_submissions;
CREATE POLICY "elearning_sub_student_update" ON public.elearning_submissions
  FOR UPDATE TO authenticated
  USING (
    student_id = public.get_my_student_id()
    AND graded_at IS NULL
    AND public.student_can_submit_to(material_id)
  )
  WITH CHECK (student_id = public.get_my_student_id());

DROP POLICY IF EXISTS "elearning_sub_student_delete" ON public.elearning_submissions;
CREATE POLICY "elearning_sub_student_delete" ON public.elearning_submissions
  FOR DELETE TO authenticated
  USING (student_id = public.get_my_student_id() AND graded_at IS NULL);

DROP POLICY IF EXISTS "elearning_sub_teacher_select" ON public.elearning_submissions;
CREATE POLICY "elearning_sub_teacher_select" ON public.elearning_submissions
  FOR SELECT TO authenticated
  USING (public.is_my_material(material_id));

DROP POLICY IF EXISTS "elearning_sub_teacher_update" ON public.elearning_submissions;
CREATE POLICY "elearning_sub_teacher_update" ON public.elearning_submissions
  FOR UPDATE TO authenticated
  USING (public.is_my_material(material_id))
  WITH CHECK (public.is_my_material(material_id));

DROP POLICY IF EXISTS "elearning_sub_admin_all" ON public.elearning_submissions;
CREATE POLICY "elearning_sub_admin_all" ON public.elearning_submissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

-- ---- Storage: bucket privat jawaban siswa --------------------
-- Path: {school_id}/{material_id}/{student_id}/{uuid}-{nama-file}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'elearning-submissions', 'elearning-submissions', false, 20971520,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.is_uuid_text(_t text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- Siswa pemilik folder (dan materi memang untuk kelasnya)
CREATE OR REPLACE FUNCTION public.student_owns_submission_path(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_uuid_text(split_part(_name, '/', 2)) AND public.is_uuid_text(split_part(_name, '/', 3))
      THEN split_part(_name, '/', 3) = public.get_my_student_id()::text
           AND public.student_can_submit_to(split_part(_name, '/', 2)::uuid)
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.student_reads_own_submission_path(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_uuid_text(split_part(_name, '/', 3))
     AND split_part(_name, '/', 3) = public.get_my_student_id()::text
$$;

CREATE OR REPLACE FUNCTION public.teacher_owns_submission_path(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_uuid_text(split_part(_name, '/', 2))
      THEN public.is_my_material(split_part(_name, '/', 2)::uuid)
    ELSE false
  END
$$;

DROP POLICY IF EXISTS "elearning submissions select" ON storage.objects;
CREATE POLICY "elearning submissions select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'elearning-submissions'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = public.get_user_school_id()::text
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.student_reads_own_submission_path(name)
          OR public.teacher_owns_submission_path(name)
        )
      )
    )
  );

DROP POLICY IF EXISTS "elearning submissions insert" ON storage.objects;
CREATE POLICY "elearning submissions insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'elearning-submissions'
    AND split_part(name, '/', 1) = public.get_user_school_id()::text
    AND public.student_owns_submission_path(name)
  );

DROP POLICY IF EXISTS "elearning submissions delete" ON storage.objects;
CREATE POLICY "elearning submissions delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'elearning-submissions'
    AND split_part(name, '/', 1) = public.get_user_school_id()::text
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.student_reads_own_submission_path(name)
    )
  );

REVOKE ALL ON FUNCTION public.get_my_student_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_my_material(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_can_submit_to(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_owns_submission_path(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_reads_own_submission_path(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teacher_owns_submission_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_student_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_material(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_can_submit_to(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_owns_submission_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_reads_own_submission_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_owns_submission_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_uuid_text(text) TO authenticated;
