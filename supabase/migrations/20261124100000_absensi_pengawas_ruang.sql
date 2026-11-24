-- Absensi siswa oleh PENGAWAS RUANG saat ujian + pemantauan daftar hadir per ruang untuk panitia ujian.
-- Jalankan SETELAH 20261123100000_exam_pengawas.sql, 20261123140000_exam_pengawas_urutan.sql dan
-- 20261123220000_exam_pelanggaran_wa_pengawas.sql (denah ruang siswa). Aman dijalankan ulang.
--
-- Aturan:
--   * Pengawas hanya bisa mengabsen siswa yang duduk di RUANG-nya (exam_student_rooms) pada SESI yang
--     memang menugaskannya (exam_invigilators), pada HARI ujian itu, mulai 30 menit sebelum sesi.
--   * Pengawas sesi pertama pada hari itu WAJIB mengabsen (ditandai is_first; dipantau panitia).
--   * Setiap simpan dicatat di exam_room_attendance (untuk pemantauan) DAN diteruskan ke tabel attendance
--     seperti absen biasa (memakai salah satu jadwal kelas siswa, sama seperti absen wali kelas), sehingga
--     masuk ke daftar hadir kelas, rekap, dan penyebaran ke jadwal lain pada hari yang sama.
--   * Tabel exam_room_attendance hanya bisa DIBACA langsung oleh panitia sekolah yang sama; tulis lewat fungsi.

CREATE TABLE IF NOT EXISTS public.exam_room_attendance (
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_date    date NOT NULL,
  start_time   text NOT NULL CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  room_no      integer NOT NULL CHECK (room_no BETWEEN 1 AND 200),
  student_id   uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('hadir', 'sakit', 'izin', 'alpa')),
  notes        text,
  teacher_id   uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  recorded_by  uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, exam_date, start_time, room_no, student_id)
);
CREATE INDEX IF NOT EXISTS exam_room_attendance_day_idx ON public.exam_room_attendance (school_id, exam_date, room_no);

ALTER TABLE public.exam_room_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "panitia_read_exam_room_attendance" ON public.exam_room_attendance;
CREATE POLICY "panitia_read_exam_room_attendance" ON public.exam_room_attendance FOR SELECT TO authenticated
  USING (public._exam_panitia_ok() AND school_id = public.get_user_school_id());
REVOKE ALL ON public.exam_room_attendance FROM PUBLIC, anon;
GRANT SELECT ON public.exam_room_attendance TO authenticated;

-- Pembantu: guru (teachers.id) milik akun yang sedang login --------------------------------------------
CREATE OR REPLACE FUNCTION public._exam_my_teacher_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id FROM public.teachers t WHERE t.user_id = auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._exam_my_teacher_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._exam_my_teacher_id() TO authenticated;

-- 1. Daftar tugas mengawas saya pada suatu hari ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exam_my_invigilation(p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_teacher uuid := public._exam_my_teacher_id();
  v_date date := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Jakarta')::date);
  v_first text;
  v_res jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_school IS NULL OR v_teacher IS NULL THEN
    RETURN jsonb_build_object('date', v_date, 'sessions', '[]'::jsonb);
  END IF;
  SELECT min(start_time) INTO v_first FROM public.exam_invigilators WHERE school_id = v_school AND exam_date = v_date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'start_time', i.start_time, 'end_time', i.end_time, 'subject', i.subject, 'room_no', i.room_no,
           'is_first', i.start_time = v_first,
           'student_count', (SELECT count(*) FROM public.exam_student_rooms r
                               JOIN public.students s ON s.id = r.student_id AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
                              WHERE r.school_id = v_school AND r.room_no = i.room_no),
           'filled_count', (SELECT count(*) FROM public.exam_room_attendance a
                             WHERE a.school_id = v_school AND a.exam_date = v_date AND a.start_time = i.start_time AND a.room_no = i.room_no),
           'recorded_at', (SELECT max(a.updated_at) FROM public.exam_room_attendance a
                             WHERE a.school_id = v_school AND a.exam_date = v_date AND a.start_time = i.start_time AND a.room_no = i.room_no)
         ) ORDER BY i.start_time), '[]'::jsonb)
    INTO v_res
    FROM public.exam_invigilators i
   WHERE i.school_id = v_school AND i.exam_date = v_date AND i.teacher_id = v_teacher;

  RETURN jsonb_build_object('date', v_date, 'sessions', v_res);
END
$$;
REVOKE ALL ON FUNCTION public.exam_my_invigilation(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_my_invigilation(date) TO authenticated;

-- 2. Daftar siswa satu ruang + status tersimpan (hanya untuk pengawas sesi/ruang itu) -----------------------
CREATE OR REPLACE FUNCTION public.exam_room_attendance_get(p_date date, p_start_time text, p_room int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_teacher uuid := public._exam_my_teacher_id();
  v_first text;
  v_subject text;
  v_end text;
  v_students jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_school IS NULL OR v_teacher IS NULL THEN
    RAISE EXCEPTION 'Akun ini bukan guru pengawas' USING ERRCODE = '42501';
  END IF;
  SELECT i.subject, i.end_time INTO v_subject, v_end
    FROM public.exam_invigilators i
   WHERE i.school_id = v_school AND i.exam_date = p_date AND i.start_time = p_start_time AND i.room_no = p_room AND i.teacher_id = v_teacher
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anda bukan pengawas ruang % pada sesi tersebut', p_room USING ERRCODE = '42501';
  END IF;
  SELECT min(start_time) INTO v_first FROM public.exam_invigilators WHERE school_id = v_school AND exam_date = p_date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'student_id', s.id, 'full_name', s.full_name, 'class_name', COALESCE(c.name, r.class_name, ''),
           'table_no', r.table_no, 'exam_number', r.exam_number,
           'saved_status', a.status, 'saved_notes', a.notes,
           -- status hari itu dari absen lain (wali kelas/guru mapel): dipakai sebagai isian awal bila belum disimpan pengawas
           'day_status', (SELECT t.status FROM public.attendance t WHERE t.student_id = s.id AND t.date = p_date
                           ORDER BY (t.status <> 'hadir') DESC, t.created_at DESC LIMIT 1)
         ) ORDER BY r.table_no NULLS LAST, s.full_name), '[]'::jsonb)
    INTO v_students
    FROM public.exam_student_rooms r
    JOIN public.students s ON s.id = r.student_id AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
    LEFT JOIN public.classes c ON c.id = s.class_id
    LEFT JOIN public.exam_room_attendance a
           ON a.school_id = v_school AND a.exam_date = p_date AND a.start_time = p_start_time AND a.room_no = p_room AND a.student_id = s.id
   WHERE r.school_id = v_school AND r.room_no = p_room;

  RETURN jsonb_build_object('room_no', p_room, 'start_time', p_start_time, 'end_time', v_end, 'subject', v_subject,
                            'is_first', p_start_time = v_first, 'students', v_students);
END
$$;
REVOKE ALL ON FUNCTION public.exam_room_attendance_get(date, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_room_attendance_get(date, text, int) TO authenticated;

-- 3. Simpan absensi ruang (hanya pengawas sesi/ruang itu, hanya hari ujian, buka 30 menit sebelum sesi) ----
-- p_rows: [{student_id, status, notes}] ; siswa di luar ruang ditolak.
CREATE OR REPLACE FUNCTION public.exam_room_attendance_save(p_date date, p_start_time text, p_room int, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_teacher uuid := public._exam_my_teacher_id();
  v_now timestamp := now() AT TIME ZONE 'Asia/Jakarta';
  v_saved int := 0;
  v_mirrored int := 0;
  v_noschedule int := 0;
  v_bad int;
  r record;
  v_sched uuid;
BEGIN
  IF auth.uid() IS NULL OR v_school IS NULL OR v_teacher IS NULL THEN
    RAISE EXCEPTION 'Akun ini bukan guru pengawas' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exam_invigilators i
                  WHERE i.school_id = v_school AND i.exam_date = p_date AND i.start_time = p_start_time
                    AND i.room_no = p_room AND i.teacher_id = v_teacher) THEN
    RAISE EXCEPTION 'Anda bukan pengawas ruang % pada sesi tersebut', p_room USING ERRCODE = '42501';
  END IF;
  IF p_date <> v_now::date THEN
    RAISE EXCEPTION 'Absensi pengawas hanya dapat diisi pada hari ujian (%)', to_char(p_date, 'DD/MM/YYYY') USING ERRCODE = '42501';
  END IF;
  IF (EXTRACT(HOUR FROM p_start_time::time) * 60 + EXTRACT(MINUTE FROM p_start_time::time) - 30)
       > (EXTRACT(HOUR FROM v_now) * 60 + EXTRACT(MINUTE FROM v_now)) THEN
    RAISE EXCEPTION 'Absensi dibuka 30 menit sebelum sesi mulai (pukul %)', p_start_time USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Tidak ada data absensi' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 100 THEN
    RAISE EXCEPTION 'Terlalu banyak siswa dalam satu ruang (maksimal 100)' USING ERRCODE = '22023';
  END IF;

  -- semua siswa harus duduk di ruang ini dan statusnya sah
  SELECT count(*) INTO v_bad
    FROM jsonb_to_recordset(p_rows) AS x(student_id uuid, status text, notes text)
   WHERE x.status NOT IN ('hadir', 'sakit', 'izin', 'alpa')
      OR NOT EXISTS (SELECT 1 FROM public.exam_student_rooms er
                      WHERE er.school_id = v_school AND er.room_no = p_room AND er.student_id = x.student_id);
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% siswa bukan penghuni ruang % atau statusnya tidak valid', v_bad, p_room USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT DISTINCT ON (x.student_id) x.student_id, x.status, NULLIF(left(btrim(COALESCE(x.notes, '')), 300), '') AS notes,
           s.class_id, s.school_id AS student_school
      FROM jsonb_to_recordset(p_rows) AS x(student_id uuid, status text, notes text)
      JOIN public.students s ON s.id = x.student_id
     ORDER BY x.student_id
  LOOP
    INSERT INTO public.exam_room_attendance (school_id, exam_date, start_time, room_no, student_id, status, notes, teacher_id, recorded_by, updated_at)
    VALUES (v_school, p_date, p_start_time, p_room, r.student_id, r.status, r.notes, v_teacher, auth.uid(), now())
    ON CONFLICT (school_id, exam_date, start_time, room_no, student_id)
    DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, teacher_id = EXCLUDED.teacher_id,
                  recorded_by = EXCLUDED.recorded_by, updated_at = now();
    v_saved := v_saved + 1;

    -- teruskan ke daftar hadir kelas (tabel attendance) lewat jadwal kelas siswa, seperti absen wali kelas
    SELECT sc.id INTO v_sched
      FROM public.schedules sc
     WHERE sc.class_id = r.class_id
     ORDER BY sc.is_active DESC,
              (sc.day_of_week IN (EXTRACT(ISODOW FROM p_date)::int, EXTRACT(DOW FROM p_date)::int)) DESC,
              sc.academic_year DESC, sc.start_time
     LIMIT 1;
    IF v_sched IS NULL THEN
      v_noschedule := v_noschedule + 1;
    ELSE
      INSERT INTO public.attendance (schedule_id, student_id, date, status, notes, created_by, school_id)
      VALUES (v_sched, r.student_id, p_date, r.status, r.notes, auth.uid(), COALESCE(r.student_school, v_school))
      ON CONFLICT (schedule_id, student_id, date)
      DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes;
      v_mirrored := v_mirrored + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('saved', v_saved, 'mirrored', v_mirrored, 'no_schedule', v_noschedule);
END
$$;
REVOKE ALL ON FUNCTION public.exam_room_attendance_save(date, text, int, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_room_attendance_save(date, text, int, jsonb) TO authenticated;

-- 4. Pemantauan panitia: daftar hadir per ruang ---------------------------------------------------------
-- rooms[].sessions[] : pengawas + jumlah siswa yang sudah diabsen per sesi (is_first = wajib)
-- rooms[].students[] : status terbaru tiap siswa pada hari itu (null = belum diabsen pengawas)
CREATE OR REPLACE FUNCTION public.exam_room_attendance_overview(p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_date date := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Jakarta')::date);
  v_first text;
  v_rooms jsonb;
BEGIN
  IF NOT public._exam_panitia_ok() THEN
    RAISE EXCEPTION 'Tidak berhak melihat absensi ruang ujian' USING ERRCODE = '42501';
  END IF;
  SELECT min(start_time) INTO v_first FROM public.exam_invigilators WHERE school_id = v_school AND exam_date = v_date;

  WITH room_nos AS (
    SELECT room_no FROM public.exam_student_rooms WHERE school_id = v_school
    UNION
    SELECT room_no FROM public.exam_invigilators WHERE school_id = v_school AND exam_date = v_date
  ), sess AS (
    SELECT i.room_no, i.start_time, min(i.end_time) AS end_time, min(i.subject) AS subject,
           jsonb_agg(jsonb_build_object('teacher_id', i.teacher_id, 'name', COALESCE(p.full_name, '(guru tanpa akun)')) ORDER BY i.slot) AS pengawas
      FROM public.exam_invigilators i
      JOIN public.teachers t ON t.id = i.teacher_id
      LEFT JOIN public.profiles p ON p.id = t.user_id
     WHERE i.school_id = v_school AND i.exam_date = v_date
     GROUP BY i.room_no, i.start_time
  ), filled AS (
    SELECT a.room_no, a.start_time, count(*) AS n, max(a.updated_at) AS at,
           (array_agg(p.full_name ORDER BY a.updated_at DESC))[1] AS by_name
      FROM public.exam_room_attendance a
      LEFT JOIN public.teachers t ON t.id = a.teacher_id
      LEFT JOIN public.profiles p ON p.id = t.user_id
     WHERE a.school_id = v_school AND a.exam_date = v_date
     GROUP BY a.room_no, a.start_time
  ), latest AS (
    SELECT DISTINCT ON (a.room_no, a.student_id) a.room_no, a.student_id, a.status, a.notes, a.start_time
      FROM public.exam_room_attendance a
     WHERE a.school_id = v_school AND a.exam_date = v_date
     ORDER BY a.room_no, a.student_id, a.updated_at DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'room_no', n.room_no,
           'sessions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'start_time', s.start_time, 'end_time', s.end_time, 'subject', s.subject, 'is_first', s.start_time = v_first,
                'pengawas', s.pengawas, 'filled_count', COALESCE(f.n, 0), 'recorded_at', f.at, 'recorded_by', f.by_name) ORDER BY s.start_time)
              FROM sess s LEFT JOIN filled f ON f.room_no = s.room_no AND f.start_time = s.start_time
             WHERE s.room_no = n.room_no), '[]'::jsonb),
           'students', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'student_id', st.id, 'full_name', st.full_name, 'class_name', COALESCE(c.name, r.class_name, ''),
                'table_no', r.table_no, 'status', l.status, 'notes', l.notes, 'start_time', l.start_time)
                ORDER BY r.table_no NULLS LAST, st.full_name)
              FROM public.exam_student_rooms r
              JOIN public.students st ON st.id = r.student_id AND st.status = 'aktif' AND COALESCE(st.is_alumni, false) = false
              LEFT JOIN public.classes c ON c.id = st.class_id
              LEFT JOIN latest l ON l.room_no = r.room_no AND l.student_id = st.id
             WHERE r.school_id = v_school AND r.room_no = n.room_no), '[]'::jsonb)
         ) ORDER BY n.room_no), '[]'::jsonb)
    INTO v_rooms
    FROM room_nos n;

  RETURN jsonb_build_object('date', v_date, 'first_start', v_first, 'rooms', v_rooms);
END
$$;
REVOKE ALL ON FUNCTION public.exam_room_attendance_overview(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_room_attendance_overview(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
