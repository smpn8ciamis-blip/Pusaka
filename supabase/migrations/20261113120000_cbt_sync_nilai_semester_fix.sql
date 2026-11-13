-- =====================================================================================
-- PERBAIKAN: "operator does not exist: integer = text" saat mengirim nilai CBT ke menu Nilai
--
-- Penyebab: _cbt_sync_grade menyimpan semester aktif di variabel TEKS lalu membandingkannya dengan
-- schedules.semester (INTEGER). Akibatnya tombol "Kirim ulang nilai" gagal, dan sinkron otomatis saat siswa
-- selesai ujian diam-diam tidak menulis nilai (trigger menelan error sebagai peringatan).
--
-- Setelah menjalankan ini: buka Ujian CBT -> klik ikon "Kirim ulang nilai ke menu Nilai" pada tiap ujian
-- yang sudah dikerjakan siswa, agar nilai yang tertinggal ikut masuk.
-- Jalankan SETELAH 20261113100000_cbt_remidial.sql. Aman dijalankan ulang.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public._cbt_sync_grade(p_exam uuid, p_student uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.cbt_exams;
  v_class uuid;
  v_sem integer;   -- semester di jadwal & pengaturan sekolah bertipe integer
  v_score numeric;
  v_sched uuid;
BEGIN
  SELECT * INTO e FROM public.cbt_exams WHERE id = p_exam;
  IF NOT FOUND OR e.grade_component IS NULL THEN RETURN 'skip'; END IF;

  v_score := public._cbt_final_score(p_exam, p_student);
  IF v_score IS NULL THEN RETURN 'skip'; END IF;

  SELECT class_id INTO v_class FROM public.students WHERE id = p_student;
  IF v_class IS NULL THEN RETURN 'no_schedule'; END IF;

  SELECT ss.active_semester INTO v_sem FROM public.school_settings ss
   ORDER BY (ss.school_id IS NOT DISTINCT FROM e.school_id) DESC NULLS LAST, ss.created_at DESC LIMIT 1;

  SELECT sc.id INTO v_sched
  FROM public.schedules sc
  WHERE sc.class_id = v_class AND sc.is_active
    AND lower(btrim(sc.subject)) = lower(btrim(e.subject))
    AND sc.academic_year = e.academic_year
    AND (v_sem IS NULL OR sc.semester = v_sem)
  ORDER BY (EXISTS (SELECT 1 FROM public.grades g WHERE g.student_id = p_student AND g.schedule_id = sc.id)) DESC,
           (sc.teacher_id::text = e.teacher_id::text) DESC, sc.id
  LIMIT 1;
  IF v_sched IS NULL THEN RETURN 'no_schedule'; END IF;

  EXECUTE format(
    'INSERT INTO public.grades (student_id, schedule_id, %1$I, created_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_id, schedule_id) DO UPDATE SET %1$I = EXCLUDED.%1$I, updated_at = now()',
    e.grade_component)
  USING p_student, v_sched, v_score, e.created_by;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public._cbt_sync_grade(uuid, uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
