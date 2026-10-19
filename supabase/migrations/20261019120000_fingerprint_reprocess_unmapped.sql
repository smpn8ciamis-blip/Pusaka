-- Perbaikan: ketukan staf ber-PIN tercatat "PIN belum dipetakan".
-- 1) fp_process_punch mengenali STAF secara langsung (tidak lagi bergantung pada trigger perbaikan).
-- 2) fp_reprocess_unmapped(): log lama bertanda 'unmapped' yang PIN-nya kini sudah dipetakan (siswa aktif / guru / staf)
--    diproses ulang agar kehadiran siswa/guru tercatat dan ketukan staf terhitung untuk piket.

CREATE OR REPLACE FUNCTION public.fp_process_punch(p_sn text, p_pin text, p_punched_at timestamptz,
                                                    p_verify integer DEFAULT NULL, p_state integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log uuid;
  s record; t record; st record; fs record; ex record; tx record; sf record;
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

CREATE OR REPLACE FUNCTION public.fp_reprocess_unmapped(p_days integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; n integer := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya admin';
  END IF;
  FOR r IN
    SELECT l.id, l.device_sn, l.pin, l.punched_at, l.verify_type, l.state
      FROM public.fingerprint_logs l
     WHERE l.result = 'unmapped'
       AND l.punched_at >= now() - make_interval(days => GREATEST(p_days, 1))
       AND (EXISTS (SELECT 1 FROM public.students s WHERE s.fingerprint_pin = l.pin AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false)
         OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.fingerprint_pin = l.pin)
         OR EXISTS (SELECT 1 FROM public.staff st WHERE st.fingerprint_pin = l.pin AND COALESCE(st.status, 'aktif') <> 'nonaktif'))
     ORDER BY l.punched_at
  LOOP
    DELETE FROM public.fingerprint_logs WHERE id = r.id;          -- log unmapped tidak punya efek kehadiran
    PERFORM public.fp_process_punch(r.device_sn, r.pin, r.punched_at, r.verify_type, r.state);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.fp_reprocess_unmapped(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_reprocess_unmapped(integer) TO authenticated;

-- Rapikan sekarang
UPDATE public.fingerprint_logs l
   SET person_type = 'staff', person_id = s.id, result = 'staff'
  FROM public.staff s
 WHERE l.result = 'unmapped' AND l.person_type IS NULL AND s.fingerprint_pin = l.pin AND COALESCE(s.status, 'aktif') <> 'nonaktif';
