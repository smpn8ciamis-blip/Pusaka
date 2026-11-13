-- =====================================================================================
-- CBT: menu Remidial (ujian ulang untuk siswa di bawah KKM, soal sama)
--
-- Alur: guru membuka tab "Remidial" pada ujian -> melihat siswa yang nilai akhirnya < KKM (pass_score)
-- -> memilih siswa lalu "Buka remidial" (batas waktu + jumlah percobaan tambahan). Hanya siswa itu yang
-- mendapat percobaan ekstra pada ujian yang sama, meskipun jadwal/status ujian sudah ditutup.
--
-- Nilai ke menu Nilai (tabel grades): nilai remidial DIBATASI maksimal KKM dan tidak pernah menurunkan nilai:
--   nilai akhir = terbesar dari (nilai reguler menurut grade_policy, nilai remidial tertinggi dibatasi KKM).
--
-- Jalankan SETELAH 20261023150000_cbt_scale_grades.sql. Aman dijalankan ulang.
-- =====================================================================================

-- ---------- Kolom & tabel ----------
ALTER TABLE public.cbt_exam_sessions
  ADD COLUMN IF NOT EXISTS is_remedial boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cbt_remedial_grants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id        uuid NOT NULL REFERENCES public.cbt_exams(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id      uuid,
  base_attempts  integer NOT NULL DEFAULT 0 CHECK (base_attempts >= 0),   -- percobaan yang sudah dipakai saat remidial dibuka
  extra_attempts integer NOT NULL DEFAULT 1 CHECK (extra_attempts BETWEEN 1 AND 5),
  opens_at       timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  granted_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_cbt_remedial_student ON public.cbt_remedial_grants(student_id) WHERE revoked_at IS NULL;

-- Hanya guru/admin yang boleh MEMBACA (siswa lewat RPC). Tulis hanya lewat RPC di bawah.
ALTER TABLE public.cbt_remedial_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cbt_remedial_staff_select" ON public.cbt_remedial_grants;
CREATE POLICY "cbt_remedial_staff_select" ON public.cbt_remedial_grants FOR SELECT TO authenticated
  USING (public._cbt_is_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin()));
REVOKE INSERT, UPDATE, DELETE ON public.cbt_remedial_grants FROM anon, authenticated;

-- ---------- Helper ----------
-- Pastikan pemanggil guru pembuat ujian / admin di sekolah yang sama; kembalikan barisnya.
CREATE OR REPLACE FUNCTION public._cbt_remedial_exam(p_exam uuid)
RETURNS public.cbt_exams
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.cbt_exams;
BEGIN
  IF NOT public._cbt_is_staff() THEN RAISE EXCEPTION 'Tidak memiliki akses' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM public.cbt_exams
   WHERE id = p_exam AND (school_id = public.get_user_school_id() OR public.is_super_admin());
  IF NOT FOUND THEN RAISE EXCEPTION 'Ujian tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF e.created_by <> auth.uid() AND NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya pembuat ujian atau admin' USING ERRCODE = '42501';
  END IF;
  RETURN e;
END;
$$;
REVOKE ALL ON FUNCTION public._cbt_remedial_exam(uuid) FROM PUBLIC, anon, authenticated;

-- Nilai akhir seorang siswa pada satu ujian (satu-satunya sumber: dipakai buku nilai & daftar remidial)
CREATE OR REPLACE FUNCTION public._cbt_final_score(p_exam uuid, p_student uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.cbt_exams;
  v_reg numeric;
  v_rem numeric;
  v_final numeric;
BEGIN
  SELECT * INTO e FROM public.cbt_exams WHERE id = p_exam;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- nilai reguler menurut kebijakan ujian (tanpa sesi remidial)
  SELECT CASE e.grade_policy
           WHEN 'latest'  THEN (array_agg(s.score ORDER BY s.attempt_number DESC))[1]
           WHEN 'average' THEN avg(s.score)
           ELSE max(s.score)
         END
    INTO v_reg
  FROM public.cbt_exam_sessions s
  WHERE s.exam_id = p_exam AND s.student_id = p_student AND NOT s.is_remedial
    AND s.status IN ('completed', 'timeout') AND s.grading_status <> 'pending_essay' AND s.score IS NOT NULL;

  -- nilai remidial tertinggi, dibatasi KKM (LEAST mengabaikan NULL, jadi dijaga eksplisit)
  SELECT CASE WHEN max(s.score) IS NULL THEN NULL ELSE least(max(s.score), COALESCE(e.pass_score, 100)) END
    INTO v_rem
  FROM public.cbt_exam_sessions s
  WHERE s.exam_id = p_exam AND s.student_id = p_student AND s.is_remedial
    AND s.status IN ('completed', 'timeout') AND s.grading_status <> 'pending_essay' AND s.score IS NOT NULL;

  v_final := CASE WHEN v_reg IS NULL THEN v_rem
                  WHEN v_rem IS NULL THEN v_reg
                  ELSE greatest(v_reg, v_rem) END;
  IF v_final IS NULL THEN RETURN NULL; END IF;
  RETURN least(100, greatest(0, round(v_final, 2)));
END;
$$;
REVOKE ALL ON FUNCTION public._cbt_final_score(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------- Sinkron nilai ke menu Nilai: memakai nilai akhir di atas ----------
CREATE OR REPLACE FUNCTION public._cbt_sync_grade(p_exam uuid, p_student uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.cbt_exams;
  v_class uuid;
  v_sem text;
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

-- ---------- RPC siswa: daftar ujian (termasuk ujian remidial yang dibuka untuknya) ----------
CREATE OR REPLACE FUNCTION public.cbt_student_exams()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid; v_class uuid; v_school uuid;
  v_exams jsonb; v_sessions jsonb;
BEGIN
  SELECT sa.student_id, s.class_id, s.school_id INTO v_student, v_class, v_school
  FROM public.student_accounts sa JOIN public.students s ON s.id = sa.student_id
  WHERE sa.user_id = auth.uid() LIMIT 1;
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('student_id', NULL, 'exams', '[]'::jsonb, 'sessions', '[]'::jsonb);
  END IF;

  -- Remidial aktif: ujian tampil walau jadwal/status ujian sudah ditutup, dan batas percobaan dinaikkan
  -- (max_attempts di balasan = percobaan yang boleh dipakai siswa ini, sehingga klien tidak perlu berubah).
  SELECT COALESCE(jsonb_agg(
           (public._cbt_exam_public(e) || CASE WHEN g.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
              'remedial', true, 'remedial_until', g.expires_at,
              'max_attempts', GREATEST(COALESCE(e.max_attempts, 1), g.base_attempts + g.extra_attempts)) END)
           ORDER BY e.start_datetime NULLS FIRST, e.title), '[]'::jsonb)
    INTO v_exams
  FROM public.cbt_exams e
  LEFT JOIN public.cbt_remedial_grants g
    ON g.exam_id = e.id AND g.student_id = v_student AND g.revoked_at IS NULL
   AND g.opens_at <= now() AND g.expires_at > now()
  WHERE (e.school_id = v_school OR e.school_id IS NULL)
    AND (
      g.id IS NOT NULL
      OR (
        e.is_active
        AND (e.start_datetime IS NULL OR e.start_datetime <= now())
        AND (e.end_datetime IS NULL OR e.end_datetime >= now())
        AND (
          (COALESCE(array_length(e.class_ids, 1), 0) = 0 AND e.class_id IS NULL)
          OR (v_class IS NOT NULL AND v_class = ANY (COALESCE(e.class_ids, ARRAY[]::uuid[])))
          OR (v_class IS NOT NULL AND e.class_id = v_class)
        )
      )
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'exam_id', s.exam_id, 'attempt_number', s.attempt_number, 'status', s.status,
           'score', s.score, 'correct_count', s.correct_count, 'wrong_count', s.wrong_count,
           'grading_status', s.grading_status, 'time_remaining_seconds', s.time_remaining_seconds,
           'created_at', s.created_at, 'end_time', s.end_time, 'is_remedial', s.is_remedial)
           ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v_sessions
  FROM public.cbt_exam_sessions s WHERE s.student_id = v_student;

  RETURN jsonb_build_object('student_id', v_student, 'exams', v_exams, 'sessions', v_sessions);
END;
$$;

-- ---------- RPC siswa: mulai ujian (hak remidial melewati jadwal & menambah percobaan) ----------
CREATE OR REPLACE FUNCTION public.cbt_start_session(p_exam_id uuid, p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid; v_class uuid; v_school uuid;
  e public.cbt_exams;
  g public.cbt_remedial_grants;
  v_sess public.cbt_exam_sessions;
  v_attempts integer; v_next integer; v_allowed integer;
  v_in_window boolean; v_remedial boolean;
BEGIN
  SELECT sa.student_id, s.class_id, s.school_id INTO v_student, v_class, v_school
  FROM public.student_accounts sa JOIN public.students s ON s.id = sa.student_id
  WHERE sa.user_id = auth.uid() LIMIT 1;
  IF v_student IS NULL THEN RAISE EXCEPTION 'Akun siswa tidak ditemukan' USING ERRCODE = '42501'; END IF;

  SELECT * INTO e FROM public.cbt_exams WHERE id = p_exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ujian tidak tersedia' USING ERRCODE = 'P0002'; END IF;
  IF e.school_id IS NOT NULL AND e.school_id IS DISTINCT FROM v_school THEN
    RAISE EXCEPTION 'Ujian tidak tersedia' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO g FROM public.cbt_remedial_grants
   WHERE exam_id = p_exam_id AND student_id = v_student AND revoked_at IS NULL
     AND opens_at <= now() AND expires_at > now();

  v_in_window := e.is_active
                 AND (e.start_datetime IS NULL OR e.start_datetime <= now())
                 AND (e.end_datetime IS NULL OR e.end_datetime >= now());

  IF g.id IS NULL THEN
    IF NOT e.is_active THEN RAISE EXCEPTION 'Ujian tidak tersedia' USING ERRCODE = 'P0002'; END IF;
    IF e.start_datetime IS NOT NULL AND e.start_datetime > now() THEN RAISE EXCEPTION 'Ujian belum dimulai'; END IF;
    IF e.end_datetime IS NOT NULL AND e.end_datetime < now() THEN RAISE EXCEPTION 'Waktu ujian sudah berakhir'; END IF;
    IF NOT (
      (COALESCE(array_length(e.class_ids, 1), 0) = 0 AND e.class_id IS NULL)
      OR (v_class IS NOT NULL AND v_class = ANY (COALESCE(e.class_ids, ARRAY[]::uuid[])))
      OR (v_class IS NOT NULL AND e.class_id = v_class)
    ) THEN RAISE EXCEPTION 'Ujian ini bukan untuk kelas Anda' USING ERRCODE = '42501'; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_exam_id::text || v_student::text, 0));

  -- sesi berjalan -> lanjutkan (tanpa token & tanpa percobaan baru)
  SELECT * INTO v_sess FROM public.cbt_exam_sessions
   WHERE exam_id = p_exam_id AND student_id = v_student AND status IN ('in_progress', 'paused')
   ORDER BY attempt_number DESC LIMIT 1;
  IF FOUND THEN
    IF e.allow_resume IS FALSE THEN RAISE EXCEPTION 'Ujian ini tidak dapat dilanjutkan'; END IF;
    RETURN jsonb_build_object('session', to_jsonb(v_sess), 'exam', public._cbt_exam_public(e));
  END IF;

  IF e.require_token AND upper(btrim(COALESCE(p_token, ''))) <> upper(btrim(COALESCE(e.exam_token, ''))) THEN
    RAISE EXCEPTION 'Token salah';
  END IF;

  SELECT count(*), COALESCE(max(attempt_number), 0) + 1 INTO v_attempts, v_next
  FROM public.cbt_exam_sessions WHERE exam_id = p_exam_id AND student_id = v_student;

  v_allowed := COALESCE(e.max_attempts, 1);
  IF g.id IS NOT NULL THEN v_allowed := GREATEST(v_allowed, g.base_attempts + g.extra_attempts); END IF;
  IF v_attempts >= v_allowed THEN RAISE EXCEPTION 'Anda sudah mencapai batas percobaan'; END IF;

  -- percobaan dihitung remidial bila di luar jatah reguler atau di luar jadwal ujian
  v_remedial := g.id IS NOT NULL AND (v_attempts >= COALESCE(e.max_attempts, 1) OR NOT v_in_window);

  INSERT INTO public.cbt_exam_sessions
    (exam_id, student_id, user_id, status, attempt_number, time_remaining_seconds, school_id, is_remedial)
  VALUES (p_exam_id, v_student, auth.uid(), 'in_progress', v_next, e.duration_minutes * 60,
          COALESCE(e.school_id, v_school), v_remedial)
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('session', to_jsonb(v_sess), 'exam', public._cbt_exam_public(e));
END;
$$;

-- ---------- RPC guru: daftar siswa di bawah KKM + status remidial ----------
CREATE OR REPLACE FUNCTION public.cbt_remedial_candidates(p_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.cbt_exams;
  v_rows jsonb;
BEGIN
  e := public._cbt_remedial_exam(p_exam_id);

  SELECT COALESCE(jsonb_agg(row_j ORDER BY (row_j->>'final_score')::numeric NULLS LAST, row_j->>'full_name'), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT jsonb_build_object(
             'student_id', c.student_id,
             'full_name', st.full_name,
             'nis', st.nis,
             'class_name', cl.name,
             'final_score', c.final_score,
             'attempts_used', (SELECT count(*) FROM public.cbt_exam_sessions x
                                WHERE x.exam_id = p_exam_id AND x.student_id = c.student_id),
             'best_regular', (SELECT max(x.score) FROM public.cbt_exam_sessions x
                               WHERE x.exam_id = p_exam_id AND x.student_id = c.student_id
                                 AND NOT x.is_remedial AND x.status IN ('completed', 'timeout')),
             'best_remedial', (SELECT max(x.score) FROM public.cbt_exam_sessions x
                                WHERE x.exam_id = p_exam_id AND x.student_id = c.student_id
                                  AND x.is_remedial AND x.status IN ('completed', 'timeout')),
             'remedial_attempts', (SELECT count(*) FROM public.cbt_exam_sessions x
                                    WHERE x.exam_id = p_exam_id AND x.student_id = c.student_id AND x.is_remedial),
             'in_progress', EXISTS (SELECT 1 FROM public.cbt_exam_sessions x
                                     WHERE x.exam_id = p_exam_id AND x.student_id = c.student_id
                                       AND x.status IN ('in_progress', 'paused')),
             'grant', CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object(
                         'extra_attempts', g.extra_attempts,
                         'expires_at', g.expires_at,
                         'revoked', g.revoked_at IS NOT NULL,
                         'active', g.revoked_at IS NULL AND g.opens_at <= now() AND g.expires_at > now()) END
           ) AS row_j
    FROM (
      SELECT d.student_id, public._cbt_final_score(p_exam_id, d.student_id) AS final_score
      FROM (SELECT DISTINCT student_id FROM public.cbt_exam_sessions WHERE exam_id = p_exam_id) d
    ) c
    JOIN public.students st ON st.id = c.student_id
    LEFT JOIN public.classes cl ON cl.id = st.class_id
    LEFT JOIN public.cbt_remedial_grants g ON g.exam_id = p_exam_id AND g.student_id = c.student_id
    WHERE st.status = 'aktif' AND COALESCE(st.is_alumni, false) = false
      AND ((c.final_score IS NOT NULL AND c.final_score < COALESCE(e.pass_score, 0)) OR g.id IS NOT NULL)
  ) q;

  RETURN jsonb_build_object('pass_score', e.pass_score, 'title', e.title, 'subject', e.subject, 'rows', v_rows);
END;
$$;

-- ---------- RPC guru: buka remidial ----------
CREATE OR REPLACE FUNCTION public.cbt_remedial_grant(
  p_exam_id uuid, p_student_ids uuid[], p_expires_at timestamptz, p_extra_attempts integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.cbt_exams;
  v_sid uuid;
  v_final numeric;
  v_n integer;
  v_ok integer := 0;
  v_skip integer := 0;
BEGIN
  e := public._cbt_remedial_exam(p_exam_id);
  IF p_student_ids IS NULL OR cardinality(p_student_ids) = 0 THEN RAISE EXCEPTION 'Pilih minimal satu siswa'; END IF;
  IF cardinality(p_student_ids) > 500 THEN RAISE EXCEPTION 'Maksimal 500 siswa sekali proses'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN RAISE EXCEPTION 'Batas waktu remidial harus di masa depan'; END IF;
  IF p_expires_at > now() + interval '60 days' THEN RAISE EXCEPTION 'Batas waktu remidial maksimal 60 hari dari sekarang'; END IF;
  IF p_extra_attempts IS NULL OR p_extra_attempts NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Percobaan tambahan harus 1 sampai 5';
  END IF;

  FOR v_sid IN SELECT DISTINCT x FROM unnest(p_student_ids) AS x LOOP
    v_final := public._cbt_final_score(p_exam_id, v_sid);
    IF v_final IS NULL OR v_final >= COALESCE(e.pass_score, 0)
       OR NOT EXISTS (SELECT 1 FROM public.students st
                       WHERE st.id = v_sid AND st.status = 'aktif' AND COALESCE(st.is_alumni, false) = false
                         AND (e.school_id IS NULL OR st.school_id IS NOT DISTINCT FROM e.school_id)) THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_n FROM public.cbt_exam_sessions WHERE exam_id = p_exam_id AND student_id = v_sid;

    INSERT INTO public.cbt_remedial_grants
      (exam_id, student_id, school_id, base_attempts, extra_attempts, opens_at, expires_at, granted_by)
    VALUES (p_exam_id, v_sid, COALESCE(e.school_id, public.get_user_school_id()), v_n, p_extra_attempts, now(), p_expires_at, auth.uid())
    ON CONFLICT (exam_id, student_id) DO UPDATE
      SET base_attempts = EXCLUDED.base_attempts, extra_attempts = EXCLUDED.extra_attempts,
          opens_at = now(), expires_at = EXCLUDED.expires_at, revoked_at = NULL,
          granted_by = EXCLUDED.granted_by, updated_at = now();
    v_ok := v_ok + 1;
  END LOOP;

  RETURN jsonb_build_object('granted', v_ok, 'skipped', v_skip);
END;
$$;

-- ---------- RPC guru: tutup remidial ----------
CREATE OR REPLACE FUNCTION public.cbt_remedial_revoke(p_exam_id uuid, p_student_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  PERFORM public._cbt_remedial_exam(p_exam_id);
  UPDATE public.cbt_remedial_grants
     SET revoked_at = now(), updated_at = now()
   WHERE exam_id = p_exam_id AND student_id = ANY (COALESCE(p_student_ids, ARRAY[]::uuid[])) AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('revoked', v_n);
END;
$$;

-- ---------- Hak akses ----------
REVOKE ALL ON FUNCTION public.cbt_student_exams() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_start_session(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_remedial_candidates(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_remedial_grant(uuid, uuid[], timestamptz, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_remedial_revoke(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_student_exams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_start_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_remedial_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_remedial_grant(uuid, uuid[], timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_remedial_revoke(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
