-- Absensi salat siswa.
--  * prayer_types: jenis salat (nama, jam mulai-selesai, batas tepat waktu, hari, sumber absen: mesin fingerprint tertentu atau kartu RFID)
--  * prayer_attendance: log kehadiran salat (1 baris per siswa per salat per hari)
--  * Mesin fingerprint: ketukan siswa pada mesin & jam yang dipilih untuk salat dicatat sebagai salat (bukan absen sekolah)
--  * RFID: halaman tap khusus /absensi-salat memanggil prayer_rfid_tap()

CREATE TABLE IF NOT EXISTS public.prayer_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  late_after time,                                  -- lewat jam ini = terlambat (kosong = tidak ada status terlambat)
  source text NOT NULL DEFAULT 'rfid' CHECK (source IN ('fingerprint', 'rfid')),
  device_sn text,                                   -- wajib bila sumber = fingerprint
  days_of_week int[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',   -- ISO: 1=Senin ... 7=Minggu
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prayer_types_time_ok CHECK (end_time > start_time),
  CONSTRAINT prayer_types_late_ok CHECK (late_after IS NULL OR (late_after >= start_time AND late_after <= end_time)),
  CONSTRAINT prayer_types_device_ok CHECK (source <> 'fingerprint' OR device_sn IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.prayer_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  prayer_type_id uuid NOT NULL REFERENCES public.prayer_types(id) ON DELETE RESTRICT,
  date date NOT NULL,
  punched_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'hadir' CHECK (status IN ('hadir', 'terlambat')),
  source text NOT NULL DEFAULT 'rfid' CHECK (source IN ('fingerprint', 'rfid', 'manual')),
  device_sn text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, prayer_type_id, date)
);
CREATE INDEX IF NOT EXISTS prayer_attendance_date_idx ON public.prayer_attendance(date DESC);
CREATE INDEX IF NOT EXISTS prayer_attendance_student_idx ON public.prayer_attendance(student_id, date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prayer_types, public.prayer_attendance TO authenticated;
GRANT ALL ON public.prayer_types, public.prayer_attendance TO service_role;
ALTER TABLE public.prayer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayer_attendance ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS auto_set_school_id_prayer_types ON public.prayer_types;
CREATE TRIGGER auto_set_school_id_prayer_types BEFORE INSERT ON public.prayer_types FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
DROP TRIGGER IF EXISTS update_prayer_types_updated_at ON public.prayer_types;
CREATE TRIGGER update_prayer_types_updated_at BEFORE UPDATE ON public.prayer_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_prayer_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan') OR public.is_super_admin();
$$;

DROP POLICY IF EXISTS "school_isolation_prayer_types" ON public.prayer_types;
CREATE POLICY "school_isolation_prayer_types" ON public.prayer_types AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());
DROP POLICY IF EXISTS "prayer_types_read" ON public.prayer_types;
CREATE POLICY "prayer_types_read" ON public.prayer_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "prayer_types_manage" ON public.prayer_types;
CREATE POLICY "prayer_types_manage" ON public.prayer_types FOR ALL TO authenticated
  USING (public.is_prayer_manager()) WITH CHECK (public.is_prayer_manager());

DROP POLICY IF EXISTS "school_isolation_prayer_attendance" ON public.prayer_attendance;
CREATE POLICY "school_isolation_prayer_attendance" ON public.prayer_attendance AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());
DROP POLICY IF EXISTS "prayer_attendance_manage" ON public.prayer_attendance;
CREATE POLICY "prayer_attendance_manage" ON public.prayer_attendance FOR ALL TO authenticated
  USING (public.is_prayer_manager() OR public.has_role(auth.uid(), 'guru_piket'))
  WITH CHECK (public.is_prayer_manager() OR public.has_role(auth.uid(), 'guru_piket'));
DROP POLICY IF EXISTS "prayer_attendance_read_homeroom" ON public.prayer_attendance;
CREATE POLICY "prayer_attendance_read_homeroom" ON public.prayer_attendance FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    JOIN public.teachers t ON t.id = c.homeroom_teacher_id
    WHERE s.id = prayer_attendance.student_id AND t.user_id = auth.uid()));
DROP POLICY IF EXISTS "prayer_attendance_read_own" ON public.prayer_attendance;
CREATE POLICY "prayer_attendance_read_own" ON public.prayer_attendance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.student_accounts sa WHERE sa.student_id = prayer_attendance.student_id AND sa.user_id = auth.uid()));

-- Inti pencatatan. Mencari jenis salat aktif untuk sumber/mesin yang jamnya cocok, lalu mencatat sekali per siswa per salat per hari.
-- Hasil: recorded | late | already | outside (tidak ada salat aktif pada jam ini)
CREATE OR REPLACE FUNCTION public.prayer_record(p_student uuid, p_source text, p_sn text, p_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  jak timestamp := (p_at AT TIME ZONE 'Asia/Jakarta');
  d date := jak::date;
  tm time := jak::time;
  dow int := EXTRACT(isodow FROM jak)::int;
  pt record; v_school uuid; v_status text; v_id uuid;
BEGIN
  SELECT * INTO pt FROM public.prayer_types
   WHERE is_active AND source = p_source
     AND (p_source <> 'fingerprint' OR device_sn = p_sn)
     AND dow = ANY(days_of_week)
     AND tm >= start_time AND tm <= end_time
   ORDER BY start_time LIMIT 1;
  IF pt.id IS NULL THEN
    RETURN jsonb_build_object('result', 'outside');
  END IF;

  SELECT school_id INTO v_school FROM public.students WHERE id = p_student;
  v_status := CASE WHEN pt.late_after IS NOT NULL AND tm > pt.late_after THEN 'terlambat' ELSE 'hadir' END;

  INSERT INTO public.prayer_attendance (school_id, student_id, prayer_type_id, date, punched_at, status, source, device_sn)
  VALUES (v_school, p_student, pt.id, d, p_at, v_status, p_source, p_sn)
  ON CONFLICT (student_id, prayer_type_id, date) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('result', 'already', 'prayer', pt.name, 'prayer_id', pt.id);
  END IF;
  RETURN jsonb_build_object('result', CASE WHEN v_status = 'terlambat' THEN 'late' ELSE 'recorded' END,
                            'status', v_status, 'prayer', pt.name, 'prayer_id', pt.id);
END;
$$;
REVOKE ALL ON FUNCTION public.prayer_record(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prayer_record(uuid, text, text, timestamptz) TO service_role;

-- Apakah ketukan fingerprint ini jatuh pada jam salat di mesin tersebut? (dipakai fp_process_punch)
CREATE OR REPLACE FUNCTION public.prayer_fp_window(p_sn text, p_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.prayer_types pt
     WHERE pt.is_active AND pt.source = 'fingerprint' AND pt.device_sn = p_sn
       AND EXTRACT(isodow FROM (p_at AT TIME ZONE 'Asia/Jakarta'))::int = ANY(pt.days_of_week)
       AND (p_at AT TIME ZONE 'Asia/Jakarta')::time BETWEEN pt.start_time AND pt.end_time);
$$;
REVOKE ALL ON FUNCTION public.prayer_fp_window(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prayer_fp_window(text, timestamptz) TO service_role;

-- RFID: halaman tap salat (publik seperti halaman tap RFID sekolah)
CREATE OR REPLACE FUNCTION public.prayer_rfid_tap(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s record; variants text[]; r jsonb; now_ts timestamptz := now();
  profile jsonb; clock text;
BEGIN
  IF p_uid IS NULL OR btrim(p_uid) = '' OR length(p_uid) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'UID kartu tidak valid');
  END IF;
  variants := public.rfid_uid_variants(p_uid);

  SELECT st2.*, c.name AS class_name INTO s
    FROM public.students st2 LEFT JOIN public.classes c ON c.id = st2.class_id
   WHERE st2.rfid_uid IS NOT NULL
     AND upper(regexp_replace(st2.rfid_uid, '[^0-9A-Za-z]', '', 'g')) = ANY(variants)
   LIMIT 1;
  IF s.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Kartu belum terdaftar. Hubungi admin sekolah.');
  END IF;
  IF (s.status IS NOT NULL AND s.status <> 'aktif') OR COALESCE(s.is_alumni, false) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Siswa tidak berstatus aktif.');
  END IF;

  profile := jsonb_build_object('id', s.id, 'full_name', s.full_name, 'nis', s.nis, 'class_name', s.class_name, 'photo_url', s.photo_url);
  clock := to_char(now_ts AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS');
  r := public.prayer_record(s.id, 'rfid', NULL, now_ts);

  RETURN CASE r->>'result'
    WHEN 'outside' THEN jsonb_build_object('ok', false, 'student', profile, 'time', clock,
                          'message', 'Belum ada jadwal salat pada jam ini.')
    WHEN 'already' THEN jsonb_build_object('ok', true, 'student', profile, 'time', clock, 'prayer', r->>'prayer',
                          'status', 'already', 'message', 'Kamu sudah absen salat ' || (r->>'prayer') || ' hari ini.')
    WHEN 'late' THEN jsonb_build_object('ok', true, 'student', profile, 'time', clock, 'prayer', r->>'prayer',
                          'status', 'terlambat', 'message', 'Absen salat ' || (r->>'prayer') || ' tercatat (terlambat).')
    ELSE jsonb_build_object('ok', true, 'student', profile, 'time', clock, 'prayer', r->>'prayer',
                          'status', 'hadir', 'message', 'Absen salat ' || (r->>'prayer') || ' tercatat. Semoga berkah!')
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.prayer_rfid_tap(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prayer_rfid_tap(text) TO anon, authenticated, service_role;

-- Salat RFID yang aktif hari ini (ditampilkan di halaman tap)
CREATE OR REPLACE FUNCTION public.prayer_rfid_schedule()
RETURNS TABLE(name text, start_time time, end_time time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT name, start_time, end_time FROM public.prayer_types
   WHERE is_active AND source = 'rfid'
     AND EXTRACT(isodow FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int = ANY(days_of_week)
   ORDER BY start_time;
$$;
GRANT EXECUTE ON FUNCTION public.prayer_rfid_schedule() TO anon, authenticated, service_role;

-- Rekap per siswa per salat (RLS pemanggil berlaku)
CREATE OR REPLACE FUNCTION public.prayer_summary(p_from date, p_to date, p_class_id uuid DEFAULT NULL)
RETURNS TABLE(student_id uuid, full_name text, nis text, class_name text, prayer_type_id uuid, hadir bigint, terlambat bigint)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT s.id, s.full_name, s.nis, c.name, pa.prayer_type_id,
         count(*) FILTER (WHERE pa.status = 'hadir'), count(*) FILTER (WHERE pa.status = 'terlambat')
    FROM public.prayer_attendance pa
    JOIN public.students s ON s.id = pa.student_id
    LEFT JOIN public.classes c ON c.id = s.class_id
   WHERE pa.date BETWEEN p_from AND p_to
     AND (p_class_id IS NULL OR s.class_id = p_class_id)
   GROUP BY s.id, s.full_name, s.nis, c.name, pa.prayer_type_id
   ORDER BY s.id, pa.prayer_type_id;
$$;
GRANT EXECUTE ON FUNCTION public.prayer_summary(date, date, uuid) TO authenticated;

-- fp_process_punch: ketukan siswa pada mesin & jam salat dicatat sebagai salat (hasil 'prayer'/'prayer_late'/'prayer_already')
CREATE OR REPLACE FUNCTION public.fp_process_punch(p_sn text, p_pin text, p_punched_at timestamptz,
                                                    p_verify integer DEFAULT NULL, p_state integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log uuid;
  s record; t record; st record; fs record; ex record; tx record; sf record; pr jsonb;
  jak timestamp; d date; mins int;
  in_start int; in_end int; late_after int; out_start int; out_end int;
  v_status text; v_result text; v_type text; v_id uuid;
BEGIN
  p_pin := btrim(p_pin);
  INSERT INTO public.fingerprint_logs (device_sn, pin, punched_at, verify_type, state)
  VALUES (p_sn, p_pin, p_punched_at, p_verify, p_state)
  ON CONFLICT (device_sn, pin, punched_at) DO NOTHING
  RETURNING id INTO v_log;
  IF v_log IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'result', 'duplicate');
  END IF;

  jak := (p_punched_at AT TIME ZONE 'Asia/Jakarta');
  d := jak::date;
  mins := EXTRACT(hour FROM jak)::int * 60 + EXTRACT(minute FROM jak)::int;

  -- 1. Siswa
  SELECT * INTO s FROM public.students WHERE fingerprint_pin = p_pin AND status = 'aktif' AND COALESCE(is_alumni, false) = false LIMIT 1;
  IF s.id IS NOT NULL THEN
    v_type := 'student'; v_id := s.id;

    IF public.prayer_fp_window(p_sn, p_punched_at) THEN
      -- Mesin ini sedang dipakai absensi salat pada jam tersebut
      pr := public.prayer_record(s.id, 'fingerprint', p_sn, p_punched_at);
      v_result := CASE pr->>'result' WHEN 'recorded' THEN 'prayer' WHEN 'late' THEN 'prayer_late' ELSE 'prayer_already' END;
    ELSE
    SELECT * INTO st FROM public.rfid_attendance_settings ORDER BY created_at LIMIT 1;
    in_start := COALESCE(EXTRACT(hour FROM st.check_in_start)::int * 60 + EXTRACT(minute FROM st.check_in_start)::int, 360);
    in_end := COALESCE(EXTRACT(hour FROM st.check_in_end)::int * 60 + EXTRACT(minute FROM st.check_in_end)::int, 450);
    late_after := COALESCE(EXTRACT(hour FROM st.late_after)::int * 60 + EXTRACT(minute FROM st.late_after)::int, 420);
    out_start := COALESCE(EXTRACT(hour FROM st.check_out_start)::int * 60 + EXTRACT(minute FROM st.check_out_start)::int, 780);
    out_end := COALESCE(EXTRACT(hour FROM st.check_out_end)::int * 60 + EXTRACT(minute FROM st.check_out_end)::int, 1020);
    SELECT * INTO ex FROM public.rfid_attendance WHERE student_id = s.id AND date = d LIMIT 1;

    IF mins >= in_start AND mins <= in_end THEN
      IF ex.check_in_at IS NOT NULL THEN
        v_result := 'already';
      ELSE
        v_status := CASE WHEN mins > late_after THEN 'terlambat' ELSE 'hadir' END;
        IF ex.id IS NOT NULL THEN
          UPDATE public.rfid_attendance SET check_in_at = p_punched_at, status = v_status WHERE id = ex.id;
        ELSE
          INSERT INTO public.rfid_attendance (student_id, date, check_in_at, status) VALUES (s.id, d, p_punched_at, v_status);
        END IF;
        v_result := CASE WHEN v_status = 'terlambat' THEN 'late' ELSE 'check_in' END;
      END IF;
    ELSIF mins >= out_start AND mins <= out_end THEN
      IF ex.id IS NULL THEN v_result := 'outside_hours';
      ELSIF ex.check_out_at IS NOT NULL THEN v_result := 'already';
      ELSE
        UPDATE public.rfid_attendance SET check_out_at = p_punched_at WHERE id = ex.id;
        v_result := 'check_out';
      END IF;
    ELSE
      v_result := 'outside_hours';
    END IF;
    END IF;

  ELSE
    -- 2. Guru
    SELECT * INTO t FROM public.teachers WHERE fingerprint_pin = p_pin LIMIT 1;
    IF t.id IS NOT NULL THEN
      v_type := 'teacher'; v_id := t.id;
      SELECT * INTO fs FROM public.fingerprint_settings WHERE id = 1;
      SELECT * INTO tx FROM public.teacher_presence WHERE teacher_id = t.id AND date = d LIMIT 1;
      IF tx.id IS NULL THEN
        v_status := CASE WHEN mins > COALESCE(EXTRACT(hour FROM fs.teacher_late_after)::int * 60 + EXTRACT(minute FROM fs.teacher_late_after)::int, 435)
                         THEN 'terlambat' ELSE 'hadir' END;
        INSERT INTO public.teacher_presence (teacher_id, date, check_in_at, status) VALUES (t.id, d, p_punched_at, v_status);
        v_result := CASE WHEN v_status = 'terlambat' THEN 'late' ELSE 'check_in' END;
      ELSIF p_punched_at >= tx.check_in_at + make_interval(mins => COALESCE(fs.teacher_min_checkout_minutes, 60)) THEN
        UPDATE public.teacher_presence SET check_out_at = p_punched_at WHERE id = tx.id;   -- tap terakhir = pulang
        v_result := 'check_out';
      ELSE
        v_result := 'already';
      END IF;
    ELSE
      -- 3. Staf (tata usaha / karyawan): dicatat sebagai 'staff'; kehadiran piket dihitung dari log ini
      SELECT * INTO sf FROM public.staff WHERE fingerprint_pin = p_pin AND COALESCE(status, 'aktif') <> 'nonaktif' LIMIT 1;
      IF sf.id IS NOT NULL THEN
        v_type := 'staff'; v_id := sf.id; v_result := 'staff';
      ELSE
        v_result := 'unmapped';
      END IF;
    END IF;
  END IF;

  UPDATE public.fingerprint_logs SET person_type = v_type, person_id = v_id, result = v_result WHERE id = v_log;
  RETURN jsonb_build_object('ok', true, 'result', v_result, 'person_type', v_type);
END;
$$;
REVOKE ALL ON FUNCTION public.fp_process_punch(text, text, timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_process_punch(text, text, timestamptz, integer, integer) TO service_role;
