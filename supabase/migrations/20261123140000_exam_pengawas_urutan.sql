-- Jadwal pengawas: guru pengawas dipilih lebih dulu (berurutan) + metode penyusunan.
-- Jalankan SETELAH 20261123100000_exam_pengawas.sql. Aman dijalankan ulang.
--   * pool_teacher_ids : daftar guru pengawas TERPILIH, urutannya = nomor guru di matriks/cetakan.
--   * method           : 'putar' (guru berpindah satu ruang tiap sesi: guru A sesi 1 ruang 1, sesi 2 ruang 2, ...)
--                        atau 'seimbang' (beban dibagi rata).
-- Kolom lama excluded_teacher_ids tidak dipakai lagi oleh aplikasi (dibiarkan agar migrasi sebelumnya tetap valid).

ALTER TABLE public.exam_invigilation_config
  ADD COLUMN IF NOT EXISTS pool_teacher_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'putar';

ALTER TABLE public.exam_invigilation_config DROP CONSTRAINT IF EXISTS exam_invigilation_config_method_chk;
ALTER TABLE public.exam_invigilation_config
  ADD CONSTRAINT exam_invigilation_config_method_chk CHECK (method IN ('putar', 'seimbang'));

CREATE OR REPLACE FUNCTION public.exam_invigilation_save(p_config jsonb DEFAULT NULL, p_rows jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_n integer := 0;
  v_bad integer;
  v_pool uuid[];
BEGIN
  IF NOT public._exam_panitia_ok() THEN
    RAISE EXCEPTION 'Tidak berhak mengubah jadwal pengawas' USING ERRCODE = '42501';
  END IF;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Akun ini belum terhubung ke sekolah' USING ERRCODE = '22023';
  END IF;

  IF p_config IS NOT NULL THEN
    IF jsonb_typeof(p_config) <> 'object' THEN
      RAISE EXCEPTION 'Pengaturan pengawas tidak valid' USING ERRCODE = '22023';
    END IF;

    -- daftar guru pengawas: urutan dipertahankan, ganda dibuang, hanya guru sekolah ini
    SELECT COALESCE(array_agg(d.id ORDER BY d.o), '{}'::uuid[]) INTO v_pool
      FROM (
        SELECT DISTINCT ON (u.x) u.x AS id, u.o
          FROM unnest(COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_config->'pool_teacher_ids'))::uuid[], '{}'::uuid[])) WITH ORDINALITY AS u(x, o)
          JOIN public.teachers t ON t.id = u.x AND t.school_id = v_school
         ORDER BY u.x, u.o
      ) d;

    INSERT INTO public.exam_invigilation_config AS c
      (school_id, rooms_count, per_room, excluded_teacher_ids, avoid_own_subject, pool_teacher_ids, method, updated_at)
    VALUES (
      v_school,
      GREATEST(1, LEAST(200, COALESCE((p_config->>'rooms_count')::int, 1))),
      GREATEST(1, LEAST(4,   COALESCE((p_config->>'per_room')::int, 2))),
      '{}',
      COALESCE((p_config->>'avoid_own_subject')::boolean, true),
      v_pool,
      CASE WHEN p_config->>'method' IN ('putar', 'seimbang') THEN p_config->>'method' ELSE 'putar' END,
      now())
    ON CONFLICT (school_id) DO UPDATE
      SET rooms_count = EXCLUDED.rooms_count, per_room = EXCLUDED.per_room,
          excluded_teacher_ids = EXCLUDED.excluded_teacher_ids,
          avoid_own_subject = EXCLUDED.avoid_own_subject,
          pool_teacher_ids = EXCLUDED.pool_teacher_ids,
          method = EXCLUDED.method, updated_at = now();
  END IF;

  IF p_rows IS NOT NULL THEN
    IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 5000 THEN
      RAISE EXCEPTION 'Jadwal pengawas harus berupa daftar (maksimal 5000 baris)' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_bad
      FROM jsonb_to_recordset(p_rows) AS r(teacher_id uuid)
      LEFT JOIN public.teachers t ON t.id = r.teacher_id AND t.school_id = v_school
     WHERE t.id IS NULL;
    IF v_bad > 0 THEN
      RAISE EXCEPTION 'Ada guru yang tidak ditemukan di sekolah ini' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.exam_invigilators WHERE school_id = v_school;
    BEGIN
      INSERT INTO public.exam_invigilators (school_id, exam_date, start_time, end_time, subject, room_no, slot, teacher_id)
      SELECT v_school, r.exam_date, r.start_time, COALESCE(r.end_time, ''), left(COALESCE(r.subject, ''), 200),
             r.room_no, COALESCE(r.slot, 1), r.teacher_id
        FROM jsonb_to_recordset(p_rows) AS r(exam_date date, start_time text, end_time text, subject text, room_no int, slot smallint, teacher_id uuid);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ada guru yang bertugas di dua ruang pada jam yang sama, atau dua guru pada tempat yang sama' USING ERRCODE = '23505';
    END;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('rows', v_n);
END
$$;
REVOKE ALL ON FUNCTION public.exam_invigilation_save(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_invigilation_save(jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
