-- WA real-time ke pengawas ruang saat siswa melanggar aturan CBT (mode anti curang).
-- Jalankan SETELAH 20261123100000_exam_pengawas.sql dan 20261123140000_exam_pengawas_urutan.sql. Aman dijalankan ulang.
--
-- Bot perlu tahu siswa duduk di ruang berapa. Ruang dihitung di peramban (Administrasi Ujian), jadi hasilnya
-- disimpan di sini oleh halaman Jadwal Pengawas:
--   * exam_student_rooms         : siswa -> nomor ruang, nomor meja, nomor peserta.
--   * exam_student_rooms_save()  : ganti seluruh isi (atomik); hanya panitia_ujian / admin / super_admin.
--   * exam_student_rooms_status(): ringkasan (jumlah siswa, jumlah ruang, waktu simpan terakhir) untuk panitia.
--   * wa_bot_settings.exam_violation_wa_enabled : saklar fitur (bawaan aktif).
-- Tabel hanya bisa DIBACA langsung oleh panitia sekolah yang sama; bot memakai service role.

CREATE TABLE IF NOT EXISTS public.exam_student_rooms (
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  room_no      integer NOT NULL CHECK (room_no BETWEEN 1 AND 200),
  table_no     integer,
  exam_number  text,
  class_name   text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, student_id)
);
CREATE INDEX IF NOT EXISTS exam_student_rooms_room_idx ON public.exam_student_rooms (school_id, room_no);

ALTER TABLE public.exam_student_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "panitia_read_exam_student_rooms" ON public.exam_student_rooms;
CREATE POLICY "panitia_read_exam_student_rooms" ON public.exam_student_rooms FOR SELECT TO authenticated
  USING (public._exam_panitia_ok() AND school_id = public.get_user_school_id());

REVOKE ALL ON public.exam_student_rooms FROM PUBLIC, anon;
GRANT SELECT ON public.exam_student_rooms TO authenticated;

-- p_rows: [{student_id, room_no, table_no, exam_number, class_name}, ...]  (array kosong = hapus semua)
CREATE OR REPLACE FUNCTION public.exam_student_rooms_save(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_n int := 0;
  v_rooms int := 0;
BEGIN
  IF NOT public._exam_panitia_ok() THEN
    RAISE EXCEPTION 'Tidak berhak menyimpan denah ruang ujian' USING ERRCODE = '42501';
  END IF;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Akun belum terkait sekolah' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Data denah tidak valid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'Terlalu banyak baris denah (maksimal 5000)' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.exam_student_rooms WHERE school_id = v_school;

  -- hanya siswa milik sekolah ini yang diterima; satu siswa satu baris
  INSERT INTO public.exam_student_rooms (school_id, student_id, room_no, table_no, exam_number, class_name)
  SELECT DISTINCT ON (r.student_id) v_school, r.student_id, r.room_no, r.table_no, left(r.exam_number, 20), left(r.class_name, 40)
    FROM jsonb_to_recordset(p_rows) AS r(student_id uuid, room_no int, table_no int, exam_number text, class_name text)
    JOIN public.students s ON s.id = r.student_id AND s.school_id IS NOT DISTINCT FROM v_school
   WHERE r.room_no BETWEEN 1 AND 200
   ORDER BY r.student_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT count(DISTINCT room_no) INTO v_rooms FROM public.exam_student_rooms WHERE school_id = v_school;
  RETURN jsonb_build_object('students', v_n, 'rooms', v_rooms);
END
$$;
REVOKE ALL ON FUNCTION public.exam_student_rooms_save(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_student_rooms_save(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.exam_student_rooms_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
BEGIN
  IF NOT public._exam_panitia_ok() THEN
    RAISE EXCEPTION 'Tidak berhak melihat denah ruang ujian' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT jsonb_build_object('students', count(*), 'rooms', count(DISTINCT room_no), 'updated_at', max(updated_at))
            FROM public.exam_student_rooms WHERE school_id = v_school);
END
$$;
REVOKE ALL ON FUNCTION public.exam_student_rooms_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_student_rooms_status() TO authenticated;

ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS exam_violation_wa_enabled boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
