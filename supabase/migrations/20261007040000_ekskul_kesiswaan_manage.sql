-- ============================================================
-- Kesiswaan dapat:
--   1) menambah & mengubah jenis ekstrakurikuler (tanpa menghapus —
--      menghapus jenis ekskul ikut menghapus data pembina & honorarium,
--      jadi cukup dinonaktifkan)
--   2) menambah & mengelola anggota ekskul
-- Jalankan setelah migrasi ekskul sebelumnya.
-- ============================================================

-- ---- 1) Jenis ekskul ----------------------------------------
DROP POLICY IF EXISTS "Kesiswaan can create extracurricular types" ON public.extracurricular_types;
CREATE POLICY "Kesiswaan can create extracurricular types" ON public.extracurricular_types
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'kesiswaan'));

DROP POLICY IF EXISTS "Kesiswaan can update extracurricular types" ON public.extracurricular_types;
CREATE POLICY "Kesiswaan can update extracurricular types" ON public.extracurricular_types
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'kesiswaan'))
  WITH CHECK (public.has_role(auth.uid(), 'kesiswaan'));

GRANT SELECT, INSERT, UPDATE ON public.extracurricular_types TO authenticated;

-- ---- 2) Anggota ekskul --------------------------------------
DROP POLICY IF EXISTS "ekskul_members_write" ON public.extracurricular_members;
CREATE POLICY "ekskul_members_write" ON public.extracurricular_members
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(extracurricular_type_id))
  )
  WITH CHECK (
    public.student_in_my_school(student_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'kesiswaan')
      OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(extracurricular_type_id))
    )
  );

-- Daftar siswa untuk dipilih sebagai anggota: tambahkan kesiswaan
CREATE OR REPLACE FUNCTION public.get_ekskul_student_directory(_type_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  nis text,
  nisn text,
  gender text,
  class_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.full_name, s.nis, s.nisn, s.gender, c.name AS class_name
  FROM public.students s
  LEFT JOIN public.classes c ON c.id = s.class_id
  WHERE s.school_id = public.get_user_school_id()
    AND COALESCE(s.is_alumni, false) = false
    AND COALESCE(s.status, 'aktif') = 'aktif'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'kesiswaan')
      OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(_type_id))
    )
  ORDER BY c.name NULLS LAST, s.full_name
$$;

REVOKE ALL ON FUNCTION public.get_ekskul_student_directory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ekskul_student_directory(uuid) TO authenticated;
