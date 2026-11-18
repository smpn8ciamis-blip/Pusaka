-- CBT: soal disimpan sebagai SATU PAKET per ujian (untuk ratusan siswa serentak).
-- Sebelumnya cbt_exam_paper() merakit JSON semua soal dari tabel cbt_questions untuk SETIAP siswa
-- (600 siswa = 600 kali perakitan yang sama). Sekarang paket dirakit sekali, disimpan di
-- cbt_exam_papers, lalu dipakai bersama oleh semua siswa. Hanya jawaban milik siswa itu yang dibaca per permintaan.
--
--   1. cbt_exam_papers       : tabel cache (RLS aktif TANPA kebijakan => tidak bisa dibaca/ditulis langsung dari
--                              aplikasi; hanya lewat fungsi SECURITY DEFINER). Kolom paper tidak dikompres di Postgres
--                              (STORAGE EXTERNAL) supaya CPU tidak terpakai untuk dekompresi tiap permintaan;
--                              kompresi ditangani gzip di nginx.
--   2. _cbt_build_paper()    : merakit paket soal (tanpa kunci jawaban), bentuk sama seperti sebelumnya.
--   3. trigger pada cbt_questions : paket otomatis dibuang bila soal ditambah/diubah/dihapus; dirakit ulang
--                              secara otomatis pada permintaan berikutnya.
--   4. cbt_exam_paper()      : memakai paket tersimpan (dirakit bila belum ada). Bentuk balasan TIDAK berubah,
--                              jadi aplikasi lama tetap bekerja. Fungsi kini VOLATILE karena dapat menulis cache.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS public.cbt_exam_papers (
  exam_id        uuid PRIMARY KEY REFERENCES public.cbt_exams(id) ON DELETE CASCADE,
  paper          jsonb NOT NULL,
  question_count integer NOT NULL DEFAULT 0,
  built_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cbt_exam_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_exam_papers ALTER COLUMN paper SET STORAGE EXTERNAL;
-- Tidak ada kebijakan RLS: akses hanya melalui fungsi SECURITY DEFINER di bawah.
REVOKE ALL ON TABLE public.cbt_exam_papers FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._cbt_build_paper(p_exam uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', q.id, 'question_number', q.question_number, 'question_text', q.question_text,
           'question_type', q.question_type, 'option_a', q.option_a, 'option_b', q.option_b,
           'option_c', q.option_c, 'option_d', q.option_d, 'option_e', q.option_e,
           'points', q.points, 'image_url', q.image_url) ORDER BY q.question_number), '[]'::jsonb)
  FROM public.cbt_questions q WHERE q.exam_id = p_exam;
$$;
REVOKE ALL ON FUNCTION public._cbt_build_paper(uuid) FROM PUBLIC, anon, authenticated;

-- Buang paket bila isi soal berubah (hanya kolom yang ikut dikirim ke siswa; mengubah kunci jawaban tidak membuangnya).
CREATE OR REPLACE FUNCTION public._cbt_paper_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM public.cbt_exam_papers WHERE exam_id = OLD.exam_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    DELETE FROM public.cbt_exam_papers WHERE exam_id = NEW.exam_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._cbt_paper_invalidate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cbt_paper_invalidate ON public.cbt_questions;
CREATE TRIGGER trg_cbt_paper_invalidate
  AFTER INSERT OR DELETE OR UPDATE OF exam_id, question_number, question_text, question_type,
    option_a, option_b, option_c, option_d, option_e, points, image_url
  ON public.cbt_questions
  FOR EACH ROW EXECUTE FUNCTION public._cbt_paper_invalidate();

-- Soal TANPA kunci jawaban + jawaban tersimpan (untuk lanjutkan). Urutan acak stabil dihitung di klien dari id sesi.
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
    v_questions := public._cbt_build_paper(s.exam_id);
    INSERT INTO public.cbt_exam_papers (exam_id, paper, question_count)
    VALUES (s.exam_id, v_questions, jsonb_array_length(v_questions))
    ON CONFLICT (exam_id) DO NOTHING;
  END IF;

  SELECT COALESCE(jsonb_object_agg(a.question_id, a.selected_answer) FILTER (WHERE a.selected_answer IS NOT NULL), '{}'::jsonb),
         COALESCE(jsonb_object_agg(a.question_id, a.essay_answer) FILTER (WHERE a.essay_answer IS NOT NULL AND btrim(a.essay_answer) <> ''), '{}'::jsonb)
    INTO v_answers, v_essays
  FROM public.cbt_student_answers a WHERE a.session_id = s.id;

  RETURN jsonb_build_object('status', s.status, 'time_remaining_seconds', s.time_remaining_seconds,
                            'questions', v_questions, 'answers', v_answers, 'essays', v_essays);
END;
$$;

REVOKE ALL ON FUNCTION public.cbt_exam_paper(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_exam_paper(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
