-- 1. Settings & columns
ALTER TABLE public.rfid_attendance_settings
  ADD COLUMN IF NOT EXISTS late_violation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS late_violation_points integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS face_verification_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.rfid_attendance
  ADD COLUMN IF NOT EXISTS face_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.student_violations ALTER COLUMN reported_by DROP NOT NULL;

-- 2. Auto violation for late taps
CREATE OR REPLACE FUNCTION public.rfid_late_violation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings record;
  v_type_id uuid;
  v_school uuid;
  v_points int;
BEGIN
  IF lower(coalesce(NEW.status, '')) <> 'terlambat' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND lower(coalesce(OLD.status, '')) = 'terlambat' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_settings FROM public.rfid_attendance_settings ORDER BY created_at LIMIT 1;
  IF v_settings.id IS NOT NULL AND v_settings.late_violation_enabled = false THEN
    RETURN NEW;
  END IF;
  v_points := COALESCE(v_settings.late_violation_points, 5);

  SELECT school_id INTO v_school FROM public.students WHERE id = NEW.student_id;

  SELECT id INTO v_type_id
  FROM public.violation_types
  WHERE lower(name) = 'terlambat masuk sekolah'
    AND (school_id IS NOT DISTINCT FROM v_school OR school_id IS NULL)
  ORDER BY (school_id IS NOT DISTINCT FROM v_school) DESC
  LIMIT 1;

  IF v_type_id IS NULL THEN
    INSERT INTO public.violation_types (name, description, points, category, is_active, school_id)
    VALUES ('Terlambat Masuk Sekolah', 'Tercatat otomatis dari absensi RFID', v_points, 'ringan', true, v_school)
    RETURNING id INTO v_type_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_violations
    WHERE student_id = NEW.student_id
      AND violation_type_id = v_type_id
      AND violation_date = NEW.date
  ) THEN
    INSERT INTO public.student_violations (student_id, violation_type_id, violation_date, points, notes, school_id)
    VALUES (NEW.student_id, v_type_id, NEW.date, v_points, 'Otomatis: terlambat tap kartu RFID', v_school);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rfid_late_violation ON public.rfid_attendance;
CREATE TRIGGER trg_rfid_late_violation
AFTER INSERT OR UPDATE OF status ON public.rfid_attendance
FOR EACH ROW EXECUTE FUNCTION public.rfid_late_violation();

-- 3. Tap RPC accepts face verification flag
CREATE OR REPLACE FUNCTION public.rfid_process_tap(p_uid text, p_face_verified boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s record;
  st record;
  ex record;
  variants text[];
  jak timestamp;
  d date;
  mins int;
  clock text;
  in_start int; in_end int; late_after int; out_start int; out_end int;
  v_status text;
  profile jsonb;
BEGIN
  IF p_uid IS NULL OR btrim(p_uid) = '' OR length(p_uid) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'UID kartu tidak valid');
  END IF;

  variants := public.rfid_uid_variants(p_uid);

  SELECT st2.*, c.name AS class_name INTO s
  FROM public.students st2
  LEFT JOIN public.classes c ON c.id = st2.class_id
  WHERE st2.rfid_uid IS NOT NULL
    AND upper(regexp_replace(st2.rfid_uid, '[^0-9A-Za-z]', '', 'g')) = ANY(variants)
  LIMIT 1;

  IF s.id IS NULL THEN
    SELECT st2.*, c.name AS class_name INTO s
    FROM public.students st2
    LEFT JOIN public.classes c ON c.id = st2.class_id
    WHERE btrim(p_uid) IN (COALESCE(st2.nis,''), COALESCE(st2.nisn,''))
    LIMIT 1;
  END IF;

  IF s.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Kartu belum terdaftar. Hubungi admin sekolah.');
  END IF;

  IF s.status IS NOT NULL AND s.status <> 'aktif' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Siswa tidak berstatus aktif.');
  END IF;

  SELECT * INTO st FROM public.rfid_attendance_settings ORDER BY created_at LIMIT 1;
  IF st.id IS NOT NULL AND st.is_active = false THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Absensi RFID sedang dinonaktifkan.');
  END IF;

  jak := (now() AT TIME ZONE 'Asia/Jakarta');
  d := jak::date;
  mins := EXTRACT(hour FROM jak)::int * 60 + EXTRACT(minute FROM jak)::int;
  clock := to_char(jak, 'HH24:MI:SS');

  in_start := COALESCE(EXTRACT(hour FROM st.check_in_start)::int * 60 + EXTRACT(minute FROM st.check_in_start)::int, 360);
  in_end := COALESCE(EXTRACT(hour FROM st.check_in_end)::int * 60 + EXTRACT(minute FROM st.check_in_end)::int, 450);
  late_after := COALESCE(EXTRACT(hour FROM st.late_after)::int * 60 + EXTRACT(minute FROM st.late_after)::int, 420);
  out_start := COALESCE(EXTRACT(hour FROM st.check_out_start)::int * 60 + EXTRACT(minute FROM st.check_out_start)::int, 780);
  out_end := COALESCE(EXTRACT(hour FROM st.check_out_end)::int * 60 + EXTRACT(minute FROM st.check_out_end)::int, 1020);

  profile := jsonb_build_object(
    'id', s.id, 'full_name', s.full_name, 'nis', s.nis, 'nisn', s.nisn,
    'photo_url', s.photo_url, 'gender', s.gender, 'class_name', s.class_name
  );

  SELECT * INTO ex FROM public.rfid_attendance WHERE student_id = s.id AND date = d LIMIT 1;

  IF mins >= in_start AND mins <= in_end THEN
    IF ex.check_in_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'type', 'already_in', 'student', profile, 'time', clock,
        'status', ex.status, 'message', 'Kamu sudah melakukan absen masuk hari ini.');
    END IF;
    v_status := CASE WHEN mins > late_after THEN 'terlambat' ELSE 'hadir' END;
    IF ex.id IS NOT NULL THEN
      UPDATE public.rfid_attendance
      SET check_in_at = now(), status = v_status, face_verified = COALESCE(p_face_verified, false)
      WHERE id = ex.id;
    ELSE
      INSERT INTO public.rfid_attendance (student_id, date, check_in_at, status, face_verified)
      VALUES (s.id, d, now(), v_status, COALESCE(p_face_verified, false));
    END IF;
    RETURN jsonb_build_object('ok', true, 'type', 'check_in', 'student', profile, 'time', clock, 'status', v_status,
      'message', CASE WHEN v_status = 'terlambat' THEN 'Absen masuk tercatat — TERLAMBAT' ELSE 'Absen masuk berhasil. Selamat belajar!' END);
  END IF;

  IF mins >= out_start AND mins <= out_end THEN
    IF ex.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'student', profile, 'message', 'Belum ada absen masuk hari ini.');
    END IF;
    IF ex.check_out_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'type', 'already_out', 'student', profile, 'time', clock,
        'status', ex.status, 'message', 'Kamu sudah melakukan absen pulang hari ini.');
    END IF;
    UPDATE public.rfid_attendance SET check_out_at = now() WHERE id = ex.id;
    RETURN jsonb_build_object('ok', true, 'type', 'check_out', 'student', profile, 'time', clock, 'status', ex.status,
      'message', 'Absen pulang berhasil. Hati-hati di jalan!');
  END IF;

  RETURN jsonb_build_object('ok', false, 'student', profile, 'time', clock,
    'message', 'Di luar jam absensi. Masuk: ' || to_char(COALESCE(st.check_in_start,'06:00'::time),'HH24:MI') || '–' ||
      to_char(COALESCE(st.check_in_end,'07:30'::time),'HH24:MI') || ', Pulang: ' ||
      to_char(COALESCE(st.check_out_start,'13:00'::time),'HH24:MI') || '–' ||
      to_char(COALESCE(st.check_out_end,'17:00'::time),'HH24:MI'));
END;
$$;

-- 4. Recap RPCs now include RFID attendance
CREATE OR REPLACE FUNCTION public.get_attendance_recap(p_start_date date, p_end_date date, p_academic_year text)
RETURNS TABLE(total bigint, hadir bigint, izin bigint, sakit bigint, alpa bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH schedule_ids AS (
    SELECT id FROM schedules WHERE academic_year = p_academic_year
  ),
  manual AS (
    SELECT DISTINCT ON (a.student_id, a.date)
      a.student_id, a.date, lower(a.status) AS status
    FROM attendance a
    INNER JOIN schedule_ids s ON a.schedule_id = s.id
    WHERE a.date >= p_start_date AND a.date <= p_end_date
    ORDER BY a.student_id, a.date, a.created_at DESC
  ),
  rfid AS (
    SELECT r.student_id, r.date,
      CASE WHEN lower(r.status) = 'terlambat' THEN 'hadir' ELSE lower(r.status) END AS status
    FROM rfid_attendance r
    INNER JOIN students stu ON stu.id = r.student_id
    INNER JOIN classes c ON c.id = stu.class_id AND c.academic_year = p_academic_year
    WHERE r.date >= p_start_date AND r.date <= p_end_date
      AND NOT EXISTS (SELECT 1 FROM manual m WHERE m.student_id = r.student_id AND m.date = r.date)
  ),
  combined AS (
    SELECT status FROM manual
    UNION ALL
    SELECT status FROM rfid
  )
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(SUM(CASE WHEN status = 'hadir' THEN 1 ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN status = 'izin' THEN 1 ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN status = 'sakit' THEN 1 ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN status = 'alpa' THEN 1 ELSE 0 END), 0)::BIGINT
  FROM combined;
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_by_class(p_start_date date, p_end_date date, p_academic_year text)
RETURNS TABLE(class_id uuid, hadir bigint, izin bigint, sakit bigint, alpa bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH schedule_class_map AS (
    SELECT id AS schedule_id, class_id
    FROM schedules
    WHERE academic_year = p_academic_year
  ),
  manual AS (
    SELECT DISTINCT ON (a.student_id, scm.class_id, a.date)
      a.student_id, scm.class_id, a.date, lower(a.status) AS status
    FROM attendance a
    INNER JOIN schedule_class_map scm ON a.schedule_id = scm.schedule_id
    WHERE a.date >= p_start_date AND a.date <= p_end_date
    ORDER BY a.student_id, scm.class_id, a.date, a.created_at DESC
  ),
  rfid AS (
    SELECT r.student_id, stu.class_id, r.date,
      CASE WHEN lower(r.status) = 'terlambat' THEN 'hadir' ELSE lower(r.status) END AS status
    FROM rfid_attendance r
    INNER JOIN students stu ON stu.id = r.student_id
    INNER JOIN classes c ON c.id = stu.class_id AND c.academic_year = p_academic_year
    WHERE r.date >= p_start_date AND r.date <= p_end_date
      AND NOT EXISTS (SELECT 1 FROM manual m WHERE m.student_id = r.student_id AND m.date = r.date)
  ),
  combined AS (
    SELECT class_id, status FROM manual
    UNION ALL
    SELECT class_id, status FROM rfid
  )
  SELECT
    combined.class_id,
    COALESCE(SUM(CASE WHEN status = 'hadir' THEN 1 ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN status = 'izin' THEN 1 ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN status = 'sakit' THEN 1 ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN status = 'alpa' THEN 1 ELSE 0 END), 0)::BIGINT
  FROM combined
  GROUP BY combined.class_id;
$$;