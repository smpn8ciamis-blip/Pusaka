-- ============================================================
-- Perketat visibilitas nilai: policy RESTRICTIVE
-- Policy RLS "permissive" saling OR-kan. Bila di database produksi masih ada
-- policy lama yang mengizinkan siswa membaca tabel grades (nama berbeda dari
-- "Students can view own grades"), nilai yang disembunyikan guru tetap bocor.
-- Policy RESTRICTIVE di-AND-kan dengan semua policy lain, jadi berlaku pasti.
-- Hanya mempengaruhi akun siswa (yang punya baris di student_accounts);
-- guru, wali kelas, kesiswaan, dan admin tidak berubah.
-- Jalankan setelah 20261008030000_elearning_and_grade_visibility.sql
-- ============================================================

DROP POLICY IF EXISTS "grades_hidden_from_students" ON public.grades;
CREATE POLICY "grades_hidden_from_students" ON public.grades
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.grades_visible_to_students(schedule_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.student_accounts sa WHERE sa.user_id = auth.uid()
    )
  );

-- Pastikan fungsi bisa dipanggil (dipakai oleh policy)
GRANT EXECUTE ON FUNCTION public.grades_visible_to_students(uuid) TO authenticated;

-- ------------------------------------------------------------
-- DIAGNOSTIK (opsional, jalankan terpisah): daftar semua policy pada grades
-- SELECT policyname, permissive, roles, cmd, qual
-- FROM pg_policies WHERE schemaname = 'public' AND tablename = 'grades';
-- ------------------------------------------------------------
