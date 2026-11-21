-- Hak akses peran panitia_ujian (peran yang sudah ada) pada modul CBT. Jalankan SETELAH 20261119190100_panitia_ujian_akses.sql. Aman dijalankan ulang.
--
-- Cakupan: panitia ujian setara admin untuk data CBT di SEKOLAHNYA SENDIRI (semua ujian, soal, sesi, jawaban, pelanggaran,
-- templat soal, remidial, sinkron nilai). Panitia ujian TIDAK mendapat akses ke modul lain (keuangan, surat, dsb.).
-- Super admin tetap lintas sekolah seperti sebelumnya.

-- 1. Pemeriksa "staf CBT" dipakai hampir semua kebijakan & fungsi CBT (soal, ujian, sesi, jawaban, remidial,
--    akhiri/kumpul paksa, pemanasan naskah). Menambahkan panitia_ujian di sini membuka semuanya sekaligus.
CREATE OR REPLACE FUNCTION public._cbt_is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'panitia_ujian') OR public.is_super_admin()
  )
$$;
REVOKE ALL ON FUNCTION public._cbt_is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._cbt_is_staff() TO authenticated;

-- 2. Kebijakan tambahan (permisif, ditambahkan di samping kebijakan yang sudah ada) untuk operasi yang di
--    kebijakan lama hanya boleh oleh pembuat ujian / admin.
DROP POLICY IF EXISTS "panitia_ujian_cbt_exams_update" ON public.cbt_exams;
CREATE POLICY "panitia_ujian_cbt_exams_update" ON public.cbt_exams FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'panitia_ujian') AND school_id = public.get_user_school_id())
  WITH CHECK (public.has_role(auth.uid(), 'panitia_ujian') AND school_id = public.get_user_school_id());

DROP POLICY IF EXISTS "panitia_ujian_cbt_exams_delete" ON public.cbt_exams;
CREATE POLICY "panitia_ujian_cbt_exams_delete" ON public.cbt_exams FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'panitia_ujian') AND school_id = public.get_user_school_id());

DROP POLICY IF EXISTS "panitia_ujian_cbt_violations_select" ON public.cbt_session_violations;
CREATE POLICY "panitia_ujian_cbt_violations_select" ON public.cbt_session_violations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'panitia_ujian')
         AND EXISTS (SELECT 1 FROM public.cbt_exams e WHERE e.id = exam_id AND e.school_id = public.get_user_school_id()));

DROP POLICY IF EXISTS "panitia_ujian_cbt_violations_delete" ON public.cbt_session_violations;
CREATE POLICY "panitia_ujian_cbt_violations_delete" ON public.cbt_session_violations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'panitia_ujian')
         AND EXISTS (SELECT 1 FROM public.cbt_exams e WHERE e.id = exam_id AND e.school_id = public.get_user_school_id()));

DO $$
DECLARE
  t text;
BEGIN
  IF to_regclass('public.cbt_question_templates') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "panitia_ujian_cbt_templates_all" ON public.cbt_question_templates';
    EXECUTE 'CREATE POLICY "panitia_ujian_cbt_templates_all" ON public.cbt_question_templates FOR ALL TO authenticated '
         || 'USING (public.has_role(auth.uid(), ''panitia_ujian'') AND school_id = public.get_user_school_id()) '
         || 'WITH CHECK (public.has_role(auth.uid(), ''panitia_ujian'') AND school_id = public.get_user_school_id())';
  END IF;
END $$;

-- 3. Fungsi yang membatasi "pembuat ujian atau admin": tambahkan panitia_ujian tanpa menyalin ulang isinya.
--    Definisi yang sedang berlaku diambil dari katalog, lalu 'admin' diperluas menjadi 'admin' ATAU 'panitia_ujian'.
--    Aman diulang (fungsi yang sudah memuat 'panitia_ujian' dilewati).
DO $$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('_cbt_remedial_exam', 'cbt_sync_grades')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('''panitia_ujian''' IN v_def) > 0 THEN CONTINUE; END IF;
    v_new := replace(v_def, 'has_role(auth.uid(), ''admin'')', 'has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''panitia_ujian'')');
    IF v_new = v_def THEN
      RAISE NOTICE 'Fungsi % tidak memuat pemeriksaan admin yang dikenali; tidak diubah', r.proname;
    ELSE
      EXECUTE v_new;
      RAISE NOTICE 'Fungsi % diperluas untuk panitia_ujian', r.proname;
    END IF;
  END LOOP;
END $$;

-- 4. Ringkasan pelanggaran per sesi untuk halaman Pantau CBT (satu baris per sesi, tanpa mengunduh semua kejadian).
CREATE OR REPLACE FUNCTION public.cbt_violation_summary(p_exam_id uuid)
RETURNS TABLE (session_id uuid, total integer, last_type text, last_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.cbt_exams;
BEGIN
  IF NOT public._cbt_is_staff() THEN RAISE EXCEPTION 'Tidak memiliki akses' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM public.cbt_exams
   WHERE id = p_exam_id AND (school_id = public.get_user_school_id() OR public.is_super_admin());
  IF NOT FOUND THEN RAISE EXCEPTION 'Ujian tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  -- guru biasa hanya untuk ujian buatannya sendiri (sama dengan kebijakan baca pelanggaran)
  IF e.created_by <> auth.uid() AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'panitia_ujian') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya pembuat ujian, admin, atau panitia_ujian' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.session_id,
           count(*)::integer,
           (array_agg(v.violation_type ORDER BY v.created_at DESC))[1],
           max(v.created_at)
      FROM public.cbt_session_violations v
     WHERE v.exam_id = p_exam_id
     GROUP BY v.session_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cbt_violation_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_violation_summary(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
