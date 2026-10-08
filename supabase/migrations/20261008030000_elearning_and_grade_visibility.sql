-- ============================================================
-- 1) Visibilitas nilai: guru mapel menentukan nilai tampil / disembunyikan dari siswa
-- 2) E-Learning: guru unggah materi (gambar, PDF, DOCX); siswa membuka materi mapel kelasnya
-- ============================================================

-- ------------------------------------------------------------
-- 1) VISIBILITAS NILAI (per kelas + mapel + tahun ajaran)
--    Tidak ada baris = nilai TERLIHAT (perilaku lama tidak berubah).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grade_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject text NOT NULL,
  academic_year text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject, academic_year)
);

ALTER TABLE public.grade_visibility ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grade_visibility TO authenticated;
GRANT ALL ON public.grade_visibility TO service_role;

DROP TRIGGER IF EXISTS auto_set_school_id_grade_visibility ON public.grade_visibility;
CREATE TRIGGER auto_set_school_id_grade_visibility
  BEFORE INSERT ON public.grade_visibility
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
DROP TRIGGER IF EXISTS update_grade_visibility_updated_at ON public.grade_visibility;
CREATE TRIGGER update_grade_visibility_updated_at
  BEFORE UPDATE ON public.grade_visibility
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "school_isolation_grade_visibility" ON public.grade_visibility;
CREATE POLICY "school_isolation_grade_visibility" ON public.grade_visibility
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

-- Guru: hanya untuk kelas+mapel yang ia ajar
CREATE OR REPLACE FUNCTION public.teaches_class_subject(_class_id uuid, _subject text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedules s
    JOIN public.teachers t ON t.id = s.teacher_id
    WHERE t.user_id = auth.uid()
      AND s.class_id = _class_id
      AND s.subject = _subject
  )
$$;

DROP POLICY IF EXISTS "grade_visibility_select" ON public.grade_visibility;
CREATE POLICY "grade_visibility_select" ON public.grade_visibility
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_super_admin()
    OR public.teaches_class_subject(class_id, subject)
  );

DROP POLICY IF EXISTS "grade_visibility_write" ON public.grade_visibility;
CREATE POLICY "grade_visibility_write" ON public.grade_visibility
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.teaches_class_subject(class_id, subject)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.teaches_class_subject(class_id, subject)
  );

-- Apakah nilai pada jadwal ini boleh dilihat siswa? (tanpa baris = boleh)
CREATE OR REPLACE FUNCTION public.grades_visible_to_students(_schedule_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.schedules s
    JOIN public.grade_visibility gv
      ON gv.class_id = s.class_id
     AND gv.subject = s.subject
     AND gv.academic_year = s.academic_year
    WHERE s.id = _schedule_id
      AND gv.is_visible = false
  )
$$;

-- Siswa hanya melihat nilainya sendiri JIKA guru mengizinkan
DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
CREATE POLICY "Students can view own grades"
ON public.grades
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    WHERE sa.student_id = grades.student_id AND sa.user_id = auth.uid()
  )
  AND public.grades_visible_to_students(grades.schedule_id)
);

-- ------------------------------------------------------------
-- 2) E-LEARNING
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.elearning_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject text NOT NULL,
  title text NOT NULL,
  description text,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,          -- image | pdf | docx
  mime_type text,
  file_size bigint,
  is_published boolean NOT NULL DEFAULT true,
  school_id uuid,
  created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_elearning_class ON public.elearning_materials(class_id, subject);
CREATE INDEX IF NOT EXISTS idx_elearning_teacher ON public.elearning_materials(teacher_id);

ALTER TABLE public.elearning_materials ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elearning_materials TO authenticated;
GRANT ALL ON public.elearning_materials TO service_role;

DROP TRIGGER IF EXISTS auto_set_school_id_elearning ON public.elearning_materials;
CREATE TRIGGER auto_set_school_id_elearning
  BEFORE INSERT ON public.elearning_materials
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
DROP TRIGGER IF EXISTS update_elearning_updated_at ON public.elearning_materials;
CREATE TRIGGER update_elearning_updated_at
  BEFORE UPDATE ON public.elearning_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "school_isolation_elearning" ON public.elearning_materials;
CREATE POLICY "school_isolation_elearning" ON public.elearning_materials
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

-- Kelas siswa yang sedang login
CREATE OR REPLACE FUNCTION public.get_my_student_class_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.class_id
  FROM public.student_accounts sa
  JOIN public.students s ON s.id = sa.student_id
  WHERE sa.user_id = auth.uid()
  LIMIT 1
$$;

-- Guru pemilik materi
CREATE OR REPLACE FUNCTION public.is_my_teacher_id(_teacher_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = _teacher_id AND t.user_id = auth.uid())
$$;

DROP POLICY IF EXISTS "elearning_teacher_manage" ON public.elearning_materials;
CREATE POLICY "elearning_teacher_manage" ON public.elearning_materials
  FOR ALL TO authenticated
  USING (public.is_my_teacher_id(teacher_id))
  WITH CHECK (
    public.is_my_teacher_id(teacher_id)
    AND public.teaches_class_subject(class_id, subject)
  );

DROP POLICY IF EXISTS "elearning_admin_all" ON public.elearning_materials;
CREATE POLICY "elearning_admin_all" ON public.elearning_materials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

DROP POLICY IF EXISTS "elearning_student_select" ON public.elearning_materials;
CREATE POLICY "elearning_student_select" ON public.elearning_materials
  FOR SELECT TO authenticated
  USING (is_published AND class_id = public.get_my_student_class_id());

-- ---- Storage: bucket privat, akses lewat signed URL ----------
-- Path: {school_id}/{class_id}/{uuid}-{nama-file}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'elearning-materials', 'elearning-materials', false, 20971520,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Siswa boleh membaca file hanya bila materi terbit & untuk kelasnya
CREATE OR REPLACE FUNCTION public.student_can_read_elearning_file(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.elearning_materials m
    WHERE m.file_path = _name
      AND m.is_published
      AND m.class_id = public.get_my_student_class_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_manage_elearning_file(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.elearning_materials m
    WHERE m.file_path = _name
      AND public.is_my_teacher_id(m.teacher_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = auth.uid())
$$;

DROP POLICY IF EXISTS "elearning files select" ON storage.objects;
CREATE POLICY "elearning files select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'elearning-materials'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = public.get_user_school_id()::text
        AND (
          public.has_role(auth.uid(), 'admin')
          OR owner = auth.uid()
          OR public.teacher_can_manage_elearning_file(name)
          OR public.student_can_read_elearning_file(name)
        )
      )
    )
  );

DROP POLICY IF EXISTS "elearning files insert" ON storage.objects;
CREATE POLICY "elearning files insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'elearning-materials'
    AND split_part(name, '/', 1) = public.get_user_school_id()::text
    AND (public.has_role(auth.uid(), 'admin') OR public.is_teacher_user())
  );

DROP POLICY IF EXISTS "elearning files delete" ON storage.objects;
CREATE POLICY "elearning files delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'elearning-materials'
    AND split_part(name, '/', 1) = public.get_user_school_id()::text
    AND (
      public.has_role(auth.uid(), 'admin')
      OR owner = auth.uid()
      OR public.teacher_can_manage_elearning_file(name)
    )
  );

REVOKE ALL ON FUNCTION public.teaches_class_subject(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grades_visible_to_students(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_student_class_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_my_teacher_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_can_read_elearning_file(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teacher_can_manage_elearning_file(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_teacher_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaches_class_subject(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grades_visible_to_students(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_student_class_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_teacher_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_can_read_elearning_file(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_manage_elearning_file(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_user() TO authenticated;
