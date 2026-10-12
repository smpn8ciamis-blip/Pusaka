-- Perbaikan integrasi fingerprint:
--  1. Nama guru ada di profiles (teachers tidak punya full_name) -> perbaiki generate PIN.
--  2. Hanya siswa AKTIF & bukan alumni (mutasi/lulus/alumni tidak dipakai & tidak digenerate PIN).
--  3. fp_list_people: daftar siswa/guru (dengan pagination & total) untuk halaman admin dan export Excel.

CREATE OR REPLACE FUNCTION public.fp_generate_pins(p_kind text, p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next bigint;
  n integer := 0;
  r record;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya admin yang dapat membuat PIN';
  END IF;
  IF p_kind NOT IN ('students', 'teachers') THEN
    RAISE EXCEPTION 'Jenis tidak valid';
  END IF;

  PERFORM pg_advisory_xact_lock(778801);

  SELECT COALESCE(max(x), 0) + 1 INTO v_next FROM (
    SELECT fingerprint_pin::bigint AS x FROM public.students WHERE fingerprint_pin ~ '^[0-9]{1,9}$'
    UNION ALL
    SELECT fingerprint_pin::bigint FROM public.teachers WHERE fingerprint_pin ~ '^[0-9]{1,9}$'
  ) t;

  IF p_kind = 'students' THEN
    FOR r IN
      SELECT s.id FROM public.students s
      LEFT JOIN public.classes c ON c.id = s.class_id
      WHERE s.fingerprint_pin IS NULL AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
        AND (p_ids IS NULL OR s.id = ANY(p_ids))
      ORDER BY c.name NULLS LAST, s.full_name
    LOOP
      IF v_next > 999999999 THEN RAISE EXCEPTION 'PIN melebihi 9 digit'; END IF;
      UPDATE public.students SET fingerprint_pin = v_next::text WHERE id = r.id;
      v_next := v_next + 1; n := n + 1;
    END LOOP;
  ELSE
    FOR r IN
      SELECT t.id FROM public.teachers t
      LEFT JOIN public.profiles p ON p.id = t.user_id
      WHERE t.fingerprint_pin IS NULL AND (p_ids IS NULL OR t.id = ANY(p_ids))
      ORDER BY p.full_name NULLS LAST
    LOOP
      IF v_next > 999999999 THEN RAISE EXCEPTION 'PIN melebihi 9 digit'; END IF;
      UPDATE public.teachers SET fingerprint_pin = v_next::text WHERE id = r.id;
      v_next := v_next + 1; n := n + 1;
    END LOOP;
  END IF;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.fp_generate_pins(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_generate_pins(text, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fp_process_punch(p_sn text, p_pin text, p_punched_at timestamptz,
                                                    p_verify integer DEFAULT NULL, p_state integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log uuid;
  s record; t record; st record; fs record; ex record; tx record;
  jak timestamp; d date; mins int;
  in_start int; in_end int; late_after int; out_start int; out_end int;
  v_status text; v_result text; v_type text; v_id uuid;
BEGIN
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
      v_result := 'unmapped';
    END IF;
  END IF;

  UPDATE public.fingerprint_logs SET person_type = v_type, person_id = v_id, result = v_result WHERE id = v_log;
  RETURN jsonb_build_object('ok', true, 'result', v_result, 'person_type', v_type);
END;
$$;
REVOKE ALL ON FUNCTION public.fp_process_punch(text, text, timestamptz, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_process_punch(text, text, timestamptz, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fp_list_people(p_kind text, p_q text DEFAULT NULL, p_only_empty boolean DEFAULT false,
                                                  p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE (id uuid, full_name text, class_name text, nis text, nisn text, nip text, fingerprint_pin text, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya admin';
  END IF;
  IF p_kind = 'students' THEN
    RETURN QUERY
      SELECT s.id, s.full_name, c.name, s.nis, s.nisn, NULL::text, s.fingerprint_pin, count(*) OVER ()
      FROM public.students s
      LEFT JOIN public.classes c ON c.id = s.class_id
      WHERE s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
        AND (p_q IS NULL OR btrim(p_q) = '' OR s.full_name ILIKE '%' || btrim(p_q) || '%')
        AND (NOT p_only_empty OR s.fingerprint_pin IS NULL)
      ORDER BY c.name NULLS LAST, s.full_name
      LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
  ELSIF p_kind = 'teachers' THEN
    RETURN QUERY
      SELECT t.id, p.full_name, NULL::text, NULL::text, NULL::text, t.nip, t.fingerprint_pin, count(*) OVER ()
      FROM public.teachers t
      LEFT JOIN public.profiles p ON p.id = t.user_id
      WHERE (p_q IS NULL OR btrim(p_q) = '' OR p.full_name ILIKE '%' || btrim(p_q) || '%')
        AND (NOT p_only_empty OR t.fingerprint_pin IS NULL)
      ORDER BY p.full_name NULLS LAST
      LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
  ELSE
    RAISE EXCEPTION 'Jenis tidak valid';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fp_list_people(text, text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_list_people(text, text, boolean, integer, integer) TO authenticated, service_role;
