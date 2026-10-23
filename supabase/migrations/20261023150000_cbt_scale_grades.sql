-- =====================================================================================
-- CBT: ringan untuk banyak siswa + aman + terhubung ke menu Nilai
--
-- 1) Alur siswa lewat RPC (server menghitung nilai; kunci jawaban tidak pernah dikirim ke siswa;
--    simpan jawaban berkelompok & hanya yang berubah; status sesi ikut dalam balasan simpan)
-- 2) Pengetatan RLS: siswa tidak bisa membaca kunci jawaban / jawaban & nilai siswa lain,
--    dan tidak bisa mengubah nilai sesinya sendiri
-- 3) Panel pengawas ringan: kolom answered_count (tanpa mengunduh semua jawaban)
-- 4) Nilai CBT otomatis masuk ke tabel grades (menu Nilai) sesuai komponen yang dipilih guru
-- =====================================================================================

-- ---------- Kolom & indeks ----------
ALTER TABLE public.cbt_exams
  ADD COLUMN IF NOT EXISTS grade_component text,
  ADD COLUMN IF NOT EXISTS grade_policy text NOT NULL DEFAULT 'highest';
ALTER TABLE public.cbt_exams DROP CONSTRAINT IF EXISTS cbt_exams_grade_component_check;
ALTER TABLE public.cbt_exams ADD CONSTRAINT cbt_exams_grade_component_check
  CHECK (grade_component IS NULL OR grade_component IN ('tugas','kuis','uts','uas','praktik'));
ALTER TABLE public.cbt_exams DROP CONSTRAINT IF EXISTS cbt_exams_grade_policy_check;
ALTER TABLE public.cbt_exams ADD CONSTRAINT cbt_exams_grade_policy_check
  CHECK (grade_policy IN ('highest','latest','average'));

ALTER TABLE public.cbt_exam_sessions
  ADD COLUMN IF NOT EXISTS answered_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cbt_sessions_exam_status ON public.cbt_exam_sessions(exam_id, status);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_student_exam ON public.cbt_exam_sessions(student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_cbt_questions_exam ON public.cbt_questions(exam_id, question_number);
CREATE INDEX IF NOT EXISTS idx_cbt_exams_active ON public.cbt_exams(is_active) WHERE is_active;

-- ---------- Helper ----------
-- Guru / admin / super admin (bukan siswa)
CREATE OR REPLACE FUNCTION public._cbt_is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin') OR public.is_super_admin()
  )
$$;
REVOKE ALL ON FUNCTION public._cbt_is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._cbt_is_staff() TO authenticated;

-- ---------- RLS ----------
-- Soal (berisi kunci jawaban): hanya guru/admin. Siswa mengambil soal lewat cbt_exam_paper().
DROP POLICY IF EXISTS "Users can view questions for their school exams" ON public.cbt_questions;
DROP POLICY IF EXISTS "cbt_questions_staff_select" ON public.cbt_questions;
CREATE POLICY "cbt_questions_staff_select" ON public.cbt_questions FOR SELECT TO authenticated
  USING (public._cbt_is_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin()));
DROP POLICY IF EXISTS "Teachers can insert questions" ON public.cbt_questions;
CREATE POLICY "Teachers can insert questions" ON public.cbt_questions FOR INSERT TO authenticated
  WITH CHECK (public._cbt_is_staff() AND school_id = public.get_user_school_id());
DROP POLICY IF EXISTS "Teachers can update questions" ON public.cbt_questions;
CREATE POLICY "Teachers can update questions" ON public.cbt_questions FOR UPDATE TO authenticated
  USING (public._cbt_is_staff() AND school_id = public.get_user_school_id());
DROP POLICY IF EXISTS "Teachers can delete questions" ON public.cbt_questions;
CREATE POLICY "Teachers can delete questions" ON public.cbt_questions FOR DELETE TO authenticated
  USING (public._cbt_is_staff() AND school_id = public.get_user_school_id());

-- Ujian: tabel hanya terbaca guru/admin (memuat token ujian & token keluar). Siswa memakai cbt_student_exams().
DROP POLICY IF EXISTS "Users can view exams in their school" ON public.cbt_exams;
DROP POLICY IF EXISTS "cbt_exams_staff_select" ON public.cbt_exams;
CREATE POLICY "cbt_exams_staff_select" ON public.cbt_exams FOR SELECT TO authenticated
  USING (public._cbt_is_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin()));

-- Ujian: hanya guru/admin yang membuat
DROP POLICY IF EXISTS "Teachers and admins can create exams" ON public.cbt_exams;
CREATE POLICY "Teachers and admins can create exams" ON public.cbt_exams FOR INSERT TO authenticated
  WITH CHECK (public._cbt_is_staff() AND school_id = public.get_user_school_id());

-- Sesi: siswa hanya melihat sesinya sendiri; tulis lewat RPC. Guru/admin mengelola sesi di sekolahnya.
DROP POLICY IF EXISTS "Users can view sessions in their school" ON public.cbt_exam_sessions;
DROP POLICY IF EXISTS "Students can create sessions" ON public.cbt_exam_sessions;
DROP POLICY IF EXISTS "Students can update their sessions" ON public.cbt_exam_sessions;
DROP POLICY IF EXISTS "cbt_sessions_select" ON public.cbt_exam_sessions;
CREATE POLICY "cbt_sessions_select" ON public.cbt_exam_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid()
      OR (public._cbt_is_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin())));
DROP POLICY IF EXISTS "cbt_sessions_staff_update" ON public.cbt_exam_sessions;
CREATE POLICY "cbt_sessions_staff_update" ON public.cbt_exam_sessions FOR UPDATE TO authenticated
  USING (public._cbt_is_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin()));
DROP POLICY IF EXISTS "cbt_sessions_staff_delete" ON public.cbt_exam_sessions;
CREATE POLICY "cbt_sessions_staff_delete" ON public.cbt_exam_sessions FOR DELETE TO authenticated
  USING (public._cbt_is_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin()));

-- Jawaban: siswa hanya melihat jawabannya sendiri; tulis lewat RPC. Guru/admin mengelola di sekolahnya.
DROP POLICY IF EXISTS "Users can view answers in their school" ON public.cbt_student_answers;
DROP POLICY IF EXISTS "Students can insert answers" ON public.cbt_student_answers;
DROP POLICY IF EXISTS "Students can update answers" ON public.cbt_student_answers;
DROP POLICY IF EXISTS "cbt_answers_select" ON public.cbt_student_answers;
CREATE POLICY "cbt_answers_select" ON public.cbt_student_answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cbt_exam_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
      OR (public._cbt_is_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin())));
DROP POLICY IF EXISTS "cbt_answers_staff_write" ON public.cbt_student_answers;
CREATE POLICY "cbt_answers_staff_write" ON public.cbt_student_answers FOR ALL TO authenticated
  USING (public._cbt_is_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin()))
  WITH CHECK (public._cbt_is_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin()));

-- ---------- Skor satu sesi (dipakai kumpul & akhiri paksa) ----------
CREATE OR REPLACE FUNCTION public._cbt_score_session(p_session uuid, p_status text DEFAULT 'completed')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam uuid;
  v_total numeric;
  v_pg_total integer;
  v_has_essay boolean;
  v_pg_score numeric;
  v_correct integer;
  v_score numeric;
  v_grading text;
BEGIN
  SELECT exam_id INTO v_exam FROM public.cbt_exam_sessions WHERE id = p_session;
  IF v_exam IS NULL THEN RAISE EXCEPTION 'Sesi tidak ditemukan' USING ERRCODE = 'P0002'; END IF;

  SELECT COALESCE(sum(COALESCE(points, 1)), 0),
         count(*) FILTER (WHERE question_type <> 'essay'),
         bool_or(question_type = 'essay')
    INTO v_total, v_pg_total, v_has_essay
  FROM public.cbt_questions WHERE exam_id = v_exam;

  SELECT COALESCE(sum(COALESCE(q.points, 1)) FILTER (WHERE a.is_correct), 0),
         count(*) FILTER (WHERE a.is_correct)
    INTO v_pg_score, v_correct
  FROM public.cbt_student_answers a
  JOIN public.cbt_questions q ON q.id = a.question_id
  WHERE a.session_id = p_session AND q.question_type <> 'essay';

  v_score := CASE WHEN v_total > 0 THEN round(v_pg_score / v_total * 100, 2) ELSE 0 END;
  v_grading := CASE WHEN COALESCE(v_has_essay, false) THEN 'pending_essay' ELSE 'auto_graded' END;

  UPDATE public.cbt_exam_sessions
     SET status = p_status, end_time = COALESCE(end_time, now()),
         score = v_score, pg_score = v_pg_score, essay_score = 0,
         correct_count = v_correct, wrong_count = GREATEST(v_pg_total - v_correct, 0),
         grading_status = v_grading, time_remaining_seconds = 0, last_activity_at = now()
   WHERE id = p_session;

  RETURN jsonb_build_object('score', v_score, 'grading_status', v_grading, 'status', p_status,
                            'correct_count', v_correct, 'wrong_count', GREATEST(v_pg_total - v_correct, 0));
END;
$$;
REVOKE ALL ON FUNCTION public._cbt_score_session(uuid, text) FROM PUBLIC, anon, authenticated;

-- Simpan jawaban (hanya yang dikirim); is_correct dihitung di server
CREATE OR REPLACE FUNCTION public._cbt_apply_answers(p_session uuid, p_answers jsonb, p_essays jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam uuid;
  v_school uuid;
  v_count integer;
BEGIN
  SELECT exam_id, school_id INTO v_exam, v_school FROM public.cbt_exam_sessions WHERE id = p_session;

  IF p_answers IS NOT NULL AND jsonb_typeof(p_answers) = 'object' AND p_answers <> '{}'::jsonb THEN
    INSERT INTO public.cbt_student_answers (session_id, question_id, selected_answer, is_correct, school_id)
    SELECT p_session, q.id, upper(j.value), (upper(j.value) = q.correct_answer), v_school
    FROM jsonb_each_text(p_answers) j
    JOIN public.cbt_questions q ON q.id::text = j.key AND q.exam_id = v_exam AND q.question_type <> 'essay'
    WHERE upper(j.value) IN ('A','B','C','D','E')
    ON CONFLICT (session_id, question_id)
    DO UPDATE SET selected_answer = EXCLUDED.selected_answer, is_correct = EXCLUDED.is_correct;
  END IF;

  IF p_essays IS NOT NULL AND jsonb_typeof(p_essays) = 'object' AND p_essays <> '{}'::jsonb THEN
    INSERT INTO public.cbt_student_answers (session_id, question_id, essay_answer, school_id)
    SELECT p_session, q.id, left(j.value, 20000), v_school
    FROM jsonb_each_text(p_essays) j
    JOIN public.cbt_questions q ON q.id::text = j.key AND q.exam_id = v_exam AND q.question_type = 'essay'
    WHERE btrim(j.value) <> ''
    ON CONFLICT (session_id, question_id)
    DO UPDATE SET essay_answer = EXCLUDED.essay_answer;
  END IF;

  SELECT count(*) INTO v_count FROM public.cbt_student_answers
   WHERE session_id = p_session AND (selected_answer IS NOT NULL OR btrim(COALESCE(essay_answer, '')) <> '');
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public._cbt_apply_answers(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- Kolom ujian yang boleh dilihat siswa (tanpa exam_token / exit_token)
CREATE OR REPLACE FUNCTION public._cbt_exam_public(e public.cbt_exams)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'title', e.title, 'subject', e.subject, 'duration_minutes', e.duration_minutes,
    'total_questions', e.total_questions, 'pass_score', e.pass_score,
    'start_datetime', e.start_datetime, 'end_datetime', e.end_datetime,
    'max_attempts', e.max_attempts, 'allow_resume', e.allow_resume, 'instructions', e.instructions,
    'require_token', e.require_token, 'exam_type', e.exam_type,
    'anti_cheat_enabled', e.anti_cheat_enabled, 'max_violations', e.max_violations,
    'has_exit_token', (e.exit_token IS NOT NULL AND e.exit_token <> ''),
    'show_result_to_student', e.show_result_to_student, 'shuffle_questions', e.shuffle_questions
  )
$$;
REVOKE ALL ON FUNCTION public._cbt_exam_public(public.cbt_exams) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._cbt_exam_public(public.cbt_exams) TO authenticated;

-- ---------- RPC siswa ----------
-- Daftar ujian untuk siswa + riwayat sesinya, satu panggilan
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

  SELECT COALESCE(jsonb_agg(public._cbt_exam_public(e) ORDER BY e.start_datetime NULLS FIRST, e.title), '[]'::jsonb)
    INTO v_exams
  FROM public.cbt_exams e
  WHERE e.is_active
    AND (e.school_id = v_school OR e.school_id IS NULL)
    AND (e.start_datetime IS NULL OR e.start_datetime <= now())
    AND (e.end_datetime IS NULL OR e.end_datetime >= now())
    AND (
      (COALESCE(array_length(e.class_ids, 1), 0) = 0 AND e.class_id IS NULL)
      OR (v_class IS NOT NULL AND v_class = ANY (COALESCE(e.class_ids, ARRAY[]::uuid[])))
      OR (v_class IS NOT NULL AND e.class_id = v_class)
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'exam_id', s.exam_id, 'attempt_number', s.attempt_number, 'status', s.status,
           'score', s.score, 'correct_count', s.correct_count, 'wrong_count', s.wrong_count,
           'grading_status', s.grading_status, 'time_remaining_seconds', s.time_remaining_seconds,
           'created_at', s.created_at, 'end_time', s.end_time) ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v_sessions
  FROM public.cbt_exam_sessions s WHERE s.student_id = v_student;

  RETURN jsonb_build_object('student_id', v_student, 'exams', v_exams, 'sessions', v_sessions);
END;
$$;

-- Mulai ujian (atau lanjutkan sesi yang masih berjalan). Token diperiksa di server.
CREATE OR REPLACE FUNCTION public.cbt_start_session(p_exam_id uuid, p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid; v_class uuid; v_school uuid;
  e public.cbt_exams;
  v_sess public.cbt_exam_sessions;
  v_attempts integer; v_next integer;
BEGIN
  SELECT sa.student_id, s.class_id, s.school_id INTO v_student, v_class, v_school
  FROM public.student_accounts sa JOIN public.students s ON s.id = sa.student_id
  WHERE sa.user_id = auth.uid() LIMIT 1;
  IF v_student IS NULL THEN RAISE EXCEPTION 'Akun siswa tidak ditemukan' USING ERRCODE = '42501'; END IF;

  SELECT * INTO e FROM public.cbt_exams WHERE id = p_exam_id;
  IF NOT FOUND OR NOT e.is_active THEN RAISE EXCEPTION 'Ujian tidak tersedia' USING ERRCODE = 'P0002'; END IF;
  IF e.school_id IS NOT NULL AND e.school_id IS DISTINCT FROM v_school THEN
    RAISE EXCEPTION 'Ujian tidak tersedia' USING ERRCODE = 'P0002';
  END IF;
  IF e.start_datetime IS NOT NULL AND e.start_datetime > now() THEN RAISE EXCEPTION 'Ujian belum dimulai'; END IF;
  IF e.end_datetime IS NOT NULL AND e.end_datetime < now() THEN RAISE EXCEPTION 'Waktu ujian sudah berakhir'; END IF;
  IF NOT (
    (COALESCE(array_length(e.class_ids, 1), 0) = 0 AND e.class_id IS NULL)
    OR (v_class IS NOT NULL AND v_class = ANY (COALESCE(e.class_ids, ARRAY[]::uuid[])))
    OR (v_class IS NOT NULL AND e.class_id = v_class)
  ) THEN RAISE EXCEPTION 'Ujian ini bukan untuk kelas Anda' USING ERRCODE = '42501'; END IF;

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
  IF v_attempts >= COALESCE(e.max_attempts, 1) THEN RAISE EXCEPTION 'Anda sudah mencapai batas percobaan'; END IF;

  INSERT INTO public.cbt_exam_sessions
    (exam_id, student_id, user_id, status, attempt_number, time_remaining_seconds, school_id)
  VALUES (p_exam_id, v_student, auth.uid(), 'in_progress', v_next, e.duration_minutes * 60, COALESCE(e.school_id, v_school))
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('session', to_jsonb(v_sess), 'exam', public._cbt_exam_public(e));
END;
$$;

-- Soal TANPA kunci jawaban + jawaban tersimpan (untuk lanjutkan). Urutan acak stabil dihitung di klien dari id sesi.
CREATE OR REPLACE FUNCTION public.cbt_exam_paper(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.cbt_exam_sessions;
  v_questions jsonb; v_answers jsonb; v_essays jsonb;
BEGIN
  SELECT * INTO s FROM public.cbt_exam_sessions WHERE id = p_session_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan' USING ERRCODE = '42501'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', q.id, 'question_number', q.question_number, 'question_text', q.question_text,
           'question_type', q.question_type, 'option_a', q.option_a, 'option_b', q.option_b,
           'option_c', q.option_c, 'option_d', q.option_d, 'option_e', q.option_e,
           'points', q.points, 'image_url', q.image_url) ORDER BY q.question_number), '[]'::jsonb)
    INTO v_questions
  FROM public.cbt_questions q WHERE q.exam_id = s.exam_id;

  SELECT COALESCE(jsonb_object_agg(a.question_id, a.selected_answer) FILTER (WHERE a.selected_answer IS NOT NULL), '{}'::jsonb),
         COALESCE(jsonb_object_agg(a.question_id, a.essay_answer) FILTER (WHERE a.essay_answer IS NOT NULL AND btrim(a.essay_answer) <> ''), '{}'::jsonb)
    INTO v_answers, v_essays
  FROM public.cbt_student_answers a WHERE a.session_id = s.id;

  RETURN jsonb_build_object('status', s.status, 'time_remaining_seconds', s.time_remaining_seconds,
                            'questions', v_questions, 'answers', v_answers, 'essays', v_essays);
END;
$$;

-- Simpan kemajuan: hanya jawaban yang berubah + sisa waktu. Balasan memuat status sesi
-- (mis. dijeda/diakhiri pengawas) sehingga klien tidak perlu polling terpisah.
CREATE OR REPLACE FUNCTION public.cbt_save_progress(
  p_session_id uuid, p_answers jsonb DEFAULT '{}'::jsonb, p_essays jsonb DEFAULT '{}'::jsonb, p_time_remaining integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.cbt_exam_sessions;
  v_count integer;
BEGIN
  SELECT * INTO s FROM public.cbt_exam_sessions WHERE id = p_session_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan' USING ERRCODE = '42501'; END IF;
  IF s.status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'status', s.status, 'grading_status', s.grading_status);
  END IF;

  v_count := public._cbt_apply_answers(s.id, p_answers, p_essays);
  UPDATE public.cbt_exam_sessions
     SET answered_count = v_count,
         time_remaining_seconds = CASE WHEN p_time_remaining IS NULL OR p_time_remaining < 0 THEN time_remaining_seconds
                                       ELSE LEAST(COALESCE(time_remaining_seconds, p_time_remaining), p_time_remaining) END,
         last_activity_at = now()
   WHERE id = s.id;
  RETURN jsonb_build_object('ok', true, 'status', 'in_progress', 'answered', v_count);
END;
$$;

-- Kumpulkan jawaban: nilai dihitung di server (idempotent)
CREATE OR REPLACE FUNCTION public.cbt_submit_session(
  p_session_id uuid, p_answers jsonb DEFAULT '{}'::jsonb, p_essays jsonb DEFAULT '{}'::jsonb, p_timeout boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.cbt_exam_sessions;
  v_count integer;
  v_res jsonb;
BEGIN
  SELECT * INTO s FROM public.cbt_exam_sessions WHERE id = p_session_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan' USING ERRCODE = '42501'; END IF;

  IF s.status IN ('completed', 'timeout') THEN
    RETURN jsonb_build_object('score', s.score, 'grading_status', s.grading_status, 'status', s.status,
                              'correct_count', s.correct_count, 'wrong_count', s.wrong_count, 'already', true);
  END IF;

  v_count := public._cbt_apply_answers(s.id, p_answers, p_essays);
  UPDATE public.cbt_exam_sessions SET answered_count = v_count WHERE id = s.id;
  v_res := public._cbt_score_session(s.id, CASE WHEN p_timeout THEN 'timeout' ELSE 'completed' END);
  RETURN v_res;
END;
$$;

-- Token keluar mode anti curang diperiksa di server (tidak dikirim ke siswa)
CREATE OR REPLACE FUNCTION public.cbt_verify_exit_token(p_exam_id uuid, p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cbt_exams e
    WHERE e.id = p_exam_id AND e.exit_token IS NOT NULL AND e.exit_token <> ''
      AND upper(btrim(e.exit_token)) = upper(btrim(COALESCE(p_token, '')))
      AND EXISTS (SELECT 1 FROM public.cbt_exam_sessions s
                  WHERE s.exam_id = e.id AND s.user_id = auth.uid() AND s.status = 'in_progress')
  )
$$;

-- ---------- RPC guru: akhiri sesi dengan perhitungan nilai ----------
CREATE OR REPLACE FUNCTION public.cbt_force_finish(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.cbt_exam_sessions;
BEGIN
  IF NOT public._cbt_is_staff() THEN RAISE EXCEPTION 'Tidak memiliki akses' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.cbt_exam_sessions
   WHERE id = p_session_id AND (school_id = public.get_user_school_id() OR public.is_super_admin());
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF s.status IN ('completed', 'timeout') THEN
    RETURN jsonb_build_object('score', s.score, 'already', true);
  END IF;
  UPDATE public.cbt_exam_sessions
     SET answered_count = (SELECT count(*) FROM public.cbt_student_answers a
                            WHERE a.session_id = s.id AND (a.selected_answer IS NOT NULL OR btrim(COALESCE(a.essay_answer, '')) <> ''))
   WHERE id = s.id;
  RETURN public._cbt_score_session(s.id, 'completed');
END;
$$;

-- ---------- Nilai CBT -> menu Nilai (tabel grades) ----------
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

  SELECT
    CASE e.grade_policy
      WHEN 'latest'  THEN (array_agg(s.score ORDER BY s.attempt_number DESC))[1]
      WHEN 'average' THEN avg(s.score)
      ELSE max(s.score)
    END
    INTO v_score
  FROM public.cbt_exam_sessions s
  WHERE s.exam_id = p_exam AND s.student_id = p_student
    AND s.status IN ('completed', 'timeout')
    AND s.grading_status <> 'pending_essay'
    AND s.score IS NOT NULL;
  IF v_score IS NULL THEN RETURN 'skip'; END IF;
  v_score := least(100, greatest(0, round(v_score, 2)));

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

CREATE OR REPLACE FUNCTION public._cbt_session_sync_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._cbt_sync_grade(NEW.exam_id, NEW.student_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'cbt grade sync: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cbt_session_sync ON public.cbt_exam_sessions;
CREATE TRIGGER trg_cbt_session_sync
  AFTER INSERT OR UPDATE OF status, score, grading_status ON public.cbt_exam_sessions
  FOR EACH ROW WHEN (NEW.status IN ('completed', 'timeout'))
  EXECUTE FUNCTION public._cbt_session_sync_trigger();

-- Sinkron ulang semua siswa suatu ujian (tombol guru)
CREATE OR REPLACE FUNCTION public.cbt_sync_grades(p_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.cbt_exams;
  r record;
  v_res text;
  v_ok integer := 0; v_no integer := 0; v_skip integer := 0;
BEGIN
  IF NOT public._cbt_is_staff() THEN RAISE EXCEPTION 'Tidak memiliki akses' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM public.cbt_exams
   WHERE id = p_exam_id AND (school_id = public.get_user_school_id() OR public.is_super_admin());
  IF NOT FOUND THEN RAISE EXCEPTION 'Ujian tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF e.created_by <> auth.uid() AND NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya pembuat ujian atau admin' USING ERRCODE = '42501';
  END IF;
  IF e.grade_component IS NULL THEN RAISE EXCEPTION 'Komponen nilai belum dipilih untuk ujian ini'; END IF;

  FOR r IN SELECT DISTINCT student_id FROM public.cbt_exam_sessions WHERE exam_id = p_exam_id LOOP
    v_res := public._cbt_sync_grade(p_exam_id, r.student_id);
    IF v_res = 'ok' THEN v_ok := v_ok + 1; ELSIF v_res = 'no_schedule' THEN v_no := v_no + 1; ELSE v_skip := v_skip + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('synced', v_ok, 'no_schedule', v_no, 'skipped', v_skip);
END;
$$;

-- ---------- Hak akses ----------
REVOKE ALL ON FUNCTION public.cbt_student_exams() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_start_session(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_exam_paper(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_save_progress(uuid, jsonb, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_submit_session(uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_verify_exit_token(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_force_finish(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_sync_grades(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_student_exams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_start_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_exam_paper(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_save_progress(uuid, jsonb, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_submit_session(uuid, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_verify_exit_token(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_force_finish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_sync_grades(uuid) TO authenticated;
