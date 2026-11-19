-- CBT: penguatan untuk ujian 600 siswa serentak (mode ringan: jawaban disimpan di perangkat).
--
--   1. Jawaban SUSULAN setelah dipaksa selesai. Bila pengawas menekan "Akhiri" untuk siswa yang sedang
--      offline, sesi dinilai dengan jawaban yang ada di server (biasanya kosong = nilai 0). Jika perangkat
--      siswa kemudian online dan masih menyimpan jawaban, jawaban itu diterima SATU KALI dalam 30 menit.
--        cbt_exam_sessions.forced_finished_at : diisi cbt_force_finish() (juga lewat cbt_finish_or_request)
--        cbt_exam_sessions.late_submitted_at  : diisi saat jawaban susulan diterima (hanya sekali)
--      Syarat jawaban susulan: pemilik sesi, status completed/timeout, forced_finished_at terisi,
--      late_submitted_at kosong, < 30 menit sejak dipaksa selesai, ada jawaban yang dikirim, dan esai belum
--      dinilai guru (grading_status auto_graded/pending_essay; bila sudah 'fully_graded' nilai guru tidak ditimpa).
--      Di luar syarat itu perilaku lama tetap: balasan 'already': true. Trigger sinkron nilai ke tabel grades
--      tetap jalan karena _cbt_score_session() menulis ulang kolom status/score/grading_status.
--   2. cbt_exam_paper(): kunci advisory per ujian agar ratusan siswa pertama tidak merakit paket soal
--      bersamaan (stampede cache); cache dibaca ulang setelah kunci didapat.
--   3. cbt_warm_paper(p_exam_id): guru "memanaskan" cache paket soal sebelum ujian.
--   4. cbt_finish_or_request(): balasan memuat answered_count (jumlah jawaban terkirim terakhir) supaya UI
--      pengawas bisa memperingatkan "jawaban belum terkirim".
-- Aman dijalankan ulang. Tidak mengubah bentuk balasan lama (hanya menambah kunci).

ALTER TABLE public.cbt_exam_sessions
  ADD COLUMN IF NOT EXISTS forced_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS late_submitted_at  timestamptz;

-- ============ 1a. Akhiri paksa oleh guru: catat waktu dipaksa selesai ============
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
     SET forced_finished_at = now(),
         answered_count = (SELECT count(*) FROM public.cbt_student_answers a
                            WHERE a.session_id = s.id AND (a.selected_answer IS NOT NULL OR btrim(COALESCE(a.essay_answer, '')) <> ''))
   WHERE id = s.id;
  RETURN public._cbt_score_session(s.id, 'completed');
END;
$$;

-- ============ 1b. Kumpulkan jawaban (idempoten) + jawaban susulan satu kali ============
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
  v_has_answers boolean;
BEGIN
  SELECT * INTO s FROM public.cbt_exam_sessions WHERE id = p_session_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan' USING ERRCODE = '42501'; END IF;

  IF s.status IN ('completed', 'timeout') THEN
    v_has_answers :=
      (p_answers IS NOT NULL AND jsonb_typeof(p_answers) = 'object' AND p_answers <> '{}'::jsonb)
      OR (p_essays IS NOT NULL AND jsonb_typeof(p_essays) = 'object' AND p_essays <> '{}'::jsonb);

    -- Jawaban susulan: hanya setelah dipaksa selesai guru, sekali saja, dalam 30 menit, esai belum dinilai guru.
    -- (Baris sudah dikunci FOR UPDATE, jadi dua permintaan serentak tidak bisa sama-sama lolos.)
    IF s.forced_finished_at IS NOT NULL
       AND s.late_submitted_at IS NULL
       AND now() - s.forced_finished_at < interval '30 minutes'
       AND v_has_answers
       AND s.grading_status IN ('auto_graded', 'pending_essay') THEN
      v_count := public._cbt_apply_answers(s.id, p_answers, p_essays);
      UPDATE public.cbt_exam_sessions
         SET answered_count = v_count, late_submitted_at = now()
       WHERE id = s.id;
      v_res := public._cbt_score_session(s.id, s.status);
      RETURN v_res || jsonb_build_object('late', true);
    END IF;

    RETURN jsonb_build_object('score', s.score, 'grading_status', s.grading_status, 'status', s.status,
                              'correct_count', s.correct_count, 'wrong_count', s.wrong_count, 'already', true);
  END IF;

  v_count := public._cbt_apply_answers(s.id, p_answers, p_essays);
  UPDATE public.cbt_exam_sessions SET answered_count = v_count WHERE id = s.id;
  v_res := public._cbt_score_session(s.id, CASE WHEN p_timeout THEN 'timeout' ELSE 'completed' END);
  RETURN v_res;
END;
$$;

-- ============ 2. cbt_exam_paper: kunci advisory agar cache dirakit satu kali ============
CREATE OR REPLACE FUNCTION public.cbt_exam_paper(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.cbt_exam_sessions;
  v_questions jsonb; v_answers jsonb; v_essays jsonb;
BEGIN
  SELECT * INTO s FROM public.cbt_exam_sessions WHERE id = p_session_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan' USING ERRCODE = '42501'; END IF;

  SELECT p.paper INTO v_questions FROM public.cbt_exam_papers p WHERE p.exam_id = s.exam_id;
  IF v_questions IS NULL THEN
    -- Cache kosong: hanya satu transaksi yang merakit; yang lain menunggu lalu memakai hasilnya.
    PERFORM pg_advisory_xact_lock(hashtextextended('cbt_paper:' || s.exam_id::text, 0));
    SELECT p.paper INTO v_questions FROM public.cbt_exam_papers p WHERE p.exam_id = s.exam_id;
    IF v_questions IS NULL THEN
      v_questions := public._cbt_build_paper(s.exam_id);
      INSERT INTO public.cbt_exam_papers (exam_id, paper, question_count)
      VALUES (s.exam_id, v_questions, jsonb_array_length(v_questions))
      ON CONFLICT (exam_id) DO NOTHING;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_object_agg(a.question_id, a.selected_answer) FILTER (WHERE a.selected_answer IS NOT NULL), '{}'::jsonb),
         COALESCE(jsonb_object_agg(a.question_id, a.essay_answer) FILTER (WHERE a.essay_answer IS NOT NULL AND btrim(a.essay_answer) <> ''), '{}'::jsonb)
    INTO v_answers, v_essays
  FROM public.cbt_student_answers a WHERE a.session_id = s.id;

  RETURN jsonb_build_object('status', s.status, 'time_remaining_seconds', s.time_remaining_seconds,
                            'questions', v_questions, 'answers', v_answers, 'essays', v_essays);
END;
$$;

-- ============ 3. Guru memanaskan cache paket soal sebelum ujian ============
CREATE OR REPLACE FUNCTION public.cbt_warm_paper(p_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.cbt_exams;
  v_paper jsonb;
BEGIN
  IF NOT public._cbt_is_staff() THEN RAISE EXCEPTION 'Tidak memiliki akses' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM public.cbt_exams
   WHERE id = p_exam_id AND (school_id = public.get_user_school_id() OR public.is_super_admin());
  IF NOT FOUND THEN RAISE EXCEPTION 'Ujian tidak ditemukan' USING ERRCODE = 'P0002'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cbt_paper:' || e.id::text, 0));
  v_paper := public._cbt_build_paper(e.id);
  INSERT INTO public.cbt_exam_papers (exam_id, paper, question_count, built_at)
  VALUES (e.id, v_paper, jsonb_array_length(v_paper), now())
  ON CONFLICT (exam_id) DO UPDATE
    SET paper = EXCLUDED.paper, question_count = EXCLUDED.question_count, built_at = EXCLUDED.built_at;

  RETURN jsonb_build_object('exam_id', e.id, 'question_count', jsonb_array_length(v_paper),
                            'bytes', octet_length(v_paper::text));
END;
$$;

-- ============ 4. cbt_finish_or_request: sertakan answered_count ============
-- Batas "tidak aktif 3 menit" di bawah bergantung pada interval heartbeat klien (CbtStudentExam.tsx,
-- HEARTBEAT_MS = 60 dtk + jitter maks 10 dtk). Siswa online selalu terlihat < ~70 dtk; 3 menit = 2 denyut terlewat.
-- Bila interval heartbeat diubah, sesuaikan angka ini.
CREATE OR REPLACE FUNCTION public.cbt_finish_or_request(p_session_id uuid, p_grace_seconds integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.cbt_exam_sessions;
  v_res jsonb;
  v_answered integer;
BEGIN
  IF NOT public._cbt_is_staff() THEN RAISE EXCEPTION 'Tidak memiliki akses' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.cbt_exam_sessions
   WHERE id = p_session_id AND (school_id = public.get_user_school_id() OR public.is_super_admin())
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF s.status IN ('completed', 'timeout') THEN
    RETURN jsonb_build_object('already', true, 'score', s.score, 'answered_count', s.answered_count);
  END IF;

  IF (s.finish_requested_at IS NOT NULL AND s.finish_requested_at < now() - make_interval(secs => GREATEST(p_grace_seconds, 0)))
     OR COALESCE(s.last_activity_at, s.created_at) < now() - interval '3 minutes' THEN
    -- jalur paksa: cbt_force_finish() mengisi forced_finished_at dan menghitung ulang answered_count
    v_res := public.cbt_force_finish(p_session_id);
    -- dibaca di pernyataan terpisah: pernyataan yang sama tidak melihat perubahan yang baru ditulis fungsi tadi
    SELECT x.answered_count INTO v_answered FROM public.cbt_exam_sessions x WHERE x.id = s.id;
    RETURN v_res || jsonb_build_object('forced', true, 'answered_count', v_answered);
  END IF;

  UPDATE public.cbt_exam_sessions SET finish_requested_at = COALESCE(finish_requested_at, now()) WHERE id = s.id;
  RETURN jsonb_build_object('requested', true, 'answered_count', s.answered_count);
END;
$$;

-- ============ Hak akses ============
REVOKE ALL ON FUNCTION public.cbt_force_finish(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_submit_session(uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_exam_paper(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_warm_paper(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_finish_or_request(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_force_finish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_submit_session(uuid, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_exam_paper(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_warm_paper(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_finish_or_request(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
