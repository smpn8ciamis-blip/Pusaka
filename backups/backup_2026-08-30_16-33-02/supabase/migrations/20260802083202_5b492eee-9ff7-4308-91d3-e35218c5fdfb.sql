
CREATE OR REPLACE FUNCTION public.rfid_process_tap(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      UPDATE public.rfid_attendance SET check_in_at = now(), status = v_status WHERE id = ex.id;
    ELSE
      INSERT INTO public.rfid_attendance (student_id, date, check_in_at, status)
      VALUES (s.id, d, now(), v_status);
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

GRANT EXECUTE ON FUNCTION public.rfid_process_tap(text) TO anon, authenticated, service_role;
