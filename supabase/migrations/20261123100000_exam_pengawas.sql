-- Jadwal pengawas ujian (peran panitia_ujian). Jalankan SETELAH 20261119190100_panitia_ujian_akses.sql
-- (memakai pemeriksa _exam_panitia_ok). Aman dijalankan ulang.
--
-- Isi:
--   * exam_invigilators        : satu baris = satu guru mengawas pada satu sesi (tanggal + jam mulai) di satu ruang.
--   * exam_invigilation_config : pengaturan generate (jumlah ruang, pengawas per ruang, guru yang tidak mengawas).
--   * exam_teacher_list()      : daftar guru sekolah (nama dari profil) untuk panitia, tanpa membuka tabel profiles.
--   * exam_invigilation_save() : simpan pengaturan + seluruh jadwal sekaligus (atomik, menggantikan isi lama).
-- Tabel hanya BISA DIBACA langsung oleh panitia_ujian / admin / super_admin sekolah yang sama; semua perubahan lewat fungsi.
-- Satu guru tidak boleh mengawas dua ruang pada tanggal + jam mulai yang sama (dijaga indeks unik).

CREATE TABLE IF NOT EXISTS public.exam_invigilators (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_date   date NOT NULL,
  start_time  text NOT NULL CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time    text NOT NULL DEFAULT '' CHECK (end_time = '' OR end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  subject     text NOT NULL DEFAULT '',
  room_no     integer NOT NULL CHECK (room_no BETWEEN 1 AND 200),
  slot        smallint NOT NULL DEFAULT 1 CHECK (slot BETWEEN 1 AND 4),
  teacher_id  uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exam_invigilators_cell_uq
  ON public.exam_invigilators (school_id, exam_date, start_time, room_no, slot);
CREATE UNIQUE INDEX IF NOT EXISTS exam_invigilators_teacher_uq
  ON public.exam_invigilators (school_id, exam_date, start_time, teacher_id);
CREATE INDEX IF NOT EXISTS exam_invigilators_teacher_idx ON public.exam_invigilators (teacher_id);

CREATE TABLE IF NOT EXISTS public.exam_invigilation_config (
  school_id            uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  rooms_count          integer  NOT NULL DEFAULT 1 CHECK (rooms_count BETWEEN 1 AND 200),
  per_room             smallint NOT NULL DEFAULT 2 CHECK (per_room BETWEEN 1 AND 4),
  excluded_teacher_ids uuid[]   NOT NULL DEFAULT '{}',
  avoid_own_subject    boolean  NOT NULL DEFAULT true,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_invigilators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_invigilation_config ENABLE ROW LEVEL SECURITY;

-- Baca saja; tidak ada kebijakan INSERT/UPDATE/DELETE (perubahan hanya lewat exam_invigilation_save).
DROP POLICY IF EXISTS "panitia_read_exam_invigilators" ON public.exam_invigilators;
CREATE POLICY "panitia_read_exam_invigilators" ON public.exam_invigilators FOR SELECT TO authenticated
  USING (public._exam_panitia_ok() AND school_id = public.get_user_school_id());

DROP POLICY IF EXISTS "panitia_read_exam_invigilation_config" ON public.exam_invigilation_config;
CREATE POLICY "panitia_read_exam_invigilation_config" ON public.exam_invigilation_config FOR SELECT TO authenticated
  USING (public._exam_panitia_ok() AND school_id = public.get_user_school_id());

REVOKE ALL ON public.exam_invigilators, public.exam_invigilation_config FROM PUBLIC, anon;
GRANT SELECT ON public.exam_invigilators, public.exam_invigilation_config TO authenticated;

-- Daftar guru sekolah ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exam_teacher_list()
RETURNS TABLE (teacher_id uuid, full_name text, nip text, subject text, jabatan text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._exam_panitia_ok() THEN
    RAISE EXCEPTION 'Tidak berhak melihat daftar guru' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT t.id, p.full_name, t.nip, t.subject, t.jabatan
      FROM public.teachers t
      JOIN public.profiles p ON p.id = t.user_id
     WHERE t.school_id IS NOT DISTINCT FROM public.get_user_school_id()
     ORDER BY p.full_name;
END
$$;
REVOKE ALL ON FUNCTION public.exam_teacher_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_teacher_list() TO authenticated;

-- Simpan pengaturan + jadwal -----------------------------------------------------------
-- p_config : {rooms_count, per_room, excluded_teacher_ids[], avoid_own_subject}  (NULL = tidak diubah)
-- p_rows   : [{exam_date, start_time, end_time, subject, room_no, slot, teacher_id}, ...]
--            NULL = jadwal tidak diubah; array (boleh kosong) = SELURUH jadwal lama diganti.
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
    INSERT INTO public.exam_invigilation_config AS c (school_id, rooms_count, per_room, excluded_teacher_ids, avoid_own_subject, updated_at)
    VALUES (
      v_school,
      GREATEST(1, LEAST(200, COALESCE((p_config->>'rooms_count')::int, 1))),
      GREATEST(1, LEAST(4,   COALESCE((p_config->>'per_room')::int, 2))),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_config->'excluded_teacher_ids'))::uuid[], '{}'),
      COALESCE((p_config->>'avoid_own_subject')::boolean, true),
      now())
    ON CONFLICT (school_id) DO UPDATE
      SET rooms_count = EXCLUDED.rooms_count, per_room = EXCLUDED.per_room,
          excluded_teacher_ids = EXCLUDED.excluded_teacher_ids,
          avoid_own_subject = EXCLUDED.avoid_own_subject, updated_at = now();
  END IF;

  IF p_rows IS NOT NULL THEN
    IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 5000 THEN
      RAISE EXCEPTION 'Jadwal pengawas harus berupa daftar (maksimal 5000 baris)' USING ERRCODE = '22023';
    END IF;

    -- semua guru harus milik sekolah ini
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
