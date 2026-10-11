-- Integrasi mesin fingerprint (ZKTeco / Solution X609, protokol ADMS "push").
-- Mesin mengirim log absen ke bot (/iclock/cdata); bot memanggil fp_process_punch().
--  * Siswa  -> rfid_attendance (masuk/pulang, sama seperti absensi RFID)
--  * Guru   -> teacher_presence (datang/pulang)

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS fingerprint_pin text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS fingerprint_pin text;
CREATE UNIQUE INDEX IF NOT EXISTS students_fingerprint_pin_key ON public.students(fingerprint_pin) WHERE fingerprint_pin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS teachers_fingerprint_pin_key ON public.teachers(fingerprint_pin) WHERE fingerprint_pin IS NOT NULL;

-- Mesin: otomatis terdaftar "menunggu" saat pertama kali menghubungi server; admin yang mengaktifkan.
CREATE TABLE IF NOT EXISTS public.fingerprint_devices (
  serial_number text PRIMARY KEY,
  name text,
  is_active boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  last_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fingerprint_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_sn text NOT NULL,
  pin text NOT NULL,
  punched_at timestamptz NOT NULL,
  verify_type integer,
  state integer,
  person_type text,            -- 'student' | 'teacher' | NULL (PIN belum dipetakan)
  person_id uuid,
  result text,                 -- check_in | check_out | already | late | unmapped | outside_hours | inactive
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_sn, pin, punched_at)
);
CREATE INDEX IF NOT EXISTS fingerprint_logs_punched_idx ON public.fingerprint_logs(punched_at DESC);

CREATE TABLE IF NOT EXISTS public.teacher_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  date date NOT NULL,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text NOT NULL DEFAULT 'hadir',   -- hadir | terlambat
  source text NOT NULL DEFAULT 'fingerprint',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, date)
);

-- Pengaturan jam guru
CREATE TABLE IF NOT EXISTS public.fingerprint_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  teacher_late_after time NOT NULL DEFAULT '07:15',
  teacher_min_checkout_minutes integer NOT NULL DEFAULT 60   -- tap berikutnya dianggap pulang bila >= x menit dari datang
);
INSERT INTO public.fingerprint_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT ALL ON public.fingerprint_devices, public.fingerprint_logs, public.teacher_presence, public.fingerprint_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fingerprint_devices, public.fingerprint_logs, public.teacher_presence, public.fingerprint_settings TO authenticated;

ALTER TABLE public.fingerprint_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fingerprint_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fingerprint_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin kelola fingerprint_devices" ON public.fingerprint_devices;
CREATE POLICY "Admin kelola fingerprint_devices" ON public.fingerprint_devices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());
DROP POLICY IF EXISTS "Admin kelola fingerprint_logs" ON public.fingerprint_logs;
CREATE POLICY "Admin kelola fingerprint_logs" ON public.fingerprint_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());
DROP POLICY IF EXISTS "Admin kelola fingerprint_settings" ON public.fingerprint_settings;
CREATE POLICY "Admin kelola fingerprint_settings" ON public.fingerprint_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());
DROP POLICY IF EXISTS "Admin kelola teacher_presence" ON public.teacher_presence;
CREATE POLICY "Admin kelola teacher_presence" ON public.teacher_presence FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());
DROP POLICY IF EXISTS "Guru lihat kehadiran sendiri" ON public.teacher_presence;
CREATE POLICY "Guru lihat kehadiran sendiri" ON public.teacher_presence FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_presence.teacher_id AND t.user_id = auth.uid()));

-- Proses satu ketukan jari. Memakai WAKTU DARI MESIN (bukan now()), jadi data yang tertunda saat
-- mesin offline tetap tercatat di jam yang benar. Idempoten: log yang sama tidak diproses dua kali.
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
  SELECT * INTO s FROM public.students WHERE fingerprint_pin = p_pin AND (status IS NULL OR status = 'aktif') LIMIT 1;
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
