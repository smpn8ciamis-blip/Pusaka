-- CBT mode ringan: soal diunduh sekali ke perangkat siswa, jawaban disimpan di perangkat dan baru
-- dikirim ke server saat siswa menekan Selesai (atau waktu habis).
-- Karena jawaban tidak lagi disimpan berkala di server, ditambahkan:
--   1. cbt_heartbeat      : denyut ringan (jumlah terjawab + sisa waktu, tanpa isi jawaban) yang juga
--                           membawa status sesi (dijeda / diakhiri pengawas / diminta dikumpulkan).
--   2. cbt_finish_or_request : "Akhiri" oleh pengawas. Lebih dulu MEMINTA perangkat siswa mengumpulkan
--                           jawabannya (agar nilai tidak 0); dipaksa langsung bila siswa tidak aktif
--                           lebih dari 3 menit atau permintaan sudah lebih dari 90 detik tidak dipenuhi.
-- Aman dijalankan ulang.

ALTER TABLE public.cbt_exam_sessions
  ADD COLUMN IF NOT EXISTS finish_requested_at timestamptz;

CREATE OR REPLACE FUNCTION public.cbt_heartbeat(
  p_session_id uuid, p_answered integer DEFAULT NULL, p_time_remaining integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.cbt_exam_sessions;
  v_total integer;
BEGIN
  SELECT * INTO s FROM public.cbt_exam_sessions WHERE id = p_session_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan' USING ERRCODE = '42501'; END IF;

  IF s.status <> 'in_progress' THEN
    IF s.status = 'paused' THEN
      UPDATE public.cbt_exam_sessions SET last_activity_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'status', s.status, 'grading_status', s.grading_status,
                              'finish_requested', s.finish_requested_at IS NOT NULL);
  END IF;

  SELECT count(*) INTO v_total FROM public.cbt_questions WHERE exam_id = s.exam_id;
  UPDATE public.cbt_exam_sessions
     SET answered_count = LEAST(GREATEST(COALESCE(p_answered, answered_count, 0), 0), v_total),
         time_remaining_seconds = CASE WHEN p_time_remaining IS NULL OR p_time_remaining < 0 THEN time_remaining_seconds
                                       ELSE LEAST(COALESCE(time_remaining_seconds, p_time_remaining), p_time_remaining) END,
         last_activity_at = now()
   WHERE id = s.id;
  RETURN jsonb_build_object('ok', true, 'status', 'in_progress',
                            'finish_requested', s.finish_requested_at IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.cbt_finish_or_request(p_session_id uuid, p_grace_seconds integer DEFAULT 90)
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
   WHERE id = p_session_id AND (school_id = public.get_user_school_id() OR public.is_super_admin())
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF s.status IN ('completed', 'timeout') THEN
    RETURN jsonb_build_object('already', true, 'score', s.score);
  END IF;

  IF (s.finish_requested_at IS NOT NULL AND s.finish_requested_at < now() - make_interval(secs => GREATEST(p_grace_seconds, 0)))
     OR COALESCE(s.last_activity_at, s.created_at) < now() - interval '3 minutes' THEN
    RETURN public.cbt_force_finish(p_session_id) || jsonb_build_object('forced', true);
  END IF;

  UPDATE public.cbt_exam_sessions SET finish_requested_at = COALESCE(finish_requested_at, now()) WHERE id = s.id;
  RETURN jsonb_build_object('requested', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cbt_heartbeat(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cbt_finish_or_request(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cbt_heartbeat(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cbt_finish_or_request(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
