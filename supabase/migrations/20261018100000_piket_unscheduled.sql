-- Absen piket TANPA jadwal: tidak langsung masuk daftar hadir / kwitansi honor piket.
-- Ketukan guru/staf di jam piket yang tidak punya jadwal ditampung di piket_unscheduled (status 'menunggu');
-- admin/bendahara memutuskan: 'hitung' (dibuat menjadi jadwal berstatus hadir) atau 'abaikan'.
ALTER TABLE public.piket_settings
  ADD COLUMN IF NOT EXISTS night_detect_start time NOT NULL DEFAULT '18:00';  -- ketukan malam sebelum jam ini dianggap pulang kantor biasa

CREATE TABLE IF NOT EXISTS public.piket_unscheduled (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id),
  shift_type text NOT NULL CHECK (shift_type IN ('malam','sabtu_minggu')),
  duty_date date NOT NULL,
  person_type text NOT NULL CHECK (person_type IN ('staff','teacher')),
  person_key text NOT NULL,                       -- id staf / guru
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  position text,
  fingerprint_pin text,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','dihitung','diabaikan')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shift_type, duty_date, person_key)
);
CREATE INDEX IF NOT EXISTS idx_piket_unscheduled_date ON public.piket_unscheduled(shift_type, duty_date, status);

GRANT SELECT ON public.piket_unscheduled TO authenticated;
GRANT ALL ON public.piket_unscheduled TO service_role;
ALTER TABLE public.piket_unscheduled ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_isolation_piket_unscheduled" ON public.piket_unscheduled;
CREATE POLICY "school_isolation_piket_unscheduled" ON public.piket_unscheduled AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());
DROP POLICY IF EXISTS "piket_unscheduled_read" ON public.piket_unscheduled;
CREATE POLICY "piket_unscheduled_read" ON public.piket_unscheduled FOR SELECT TO authenticated
  USING (public.is_piket_manager());

-- Guru & staf ber-PIN (siswa tidak ikut)
CREATE OR REPLACE FUNCTION public._piket_people(p_school uuid, p_all boolean)
RETURNS TABLE (ptype text, pid uuid, pname text, pposition text, ppin text, pschool uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'staff'::text, st.id, st.full_name, st.position, st.fingerprint_pin, st.school_id
    FROM public.staff st
   WHERE st.fingerprint_pin IS NOT NULL AND st.fingerprint_pin <> '' AND COALESCE(st.status,'aktif') <> 'nonaktif'
     AND (p_all OR st.school_id IS NOT DISTINCT FROM p_school)
  UNION ALL
  SELECT 'teacher'::text, t.id, COALESCE((SELECT pr.full_name FROM public.profiles pr WHERE pr.id = t.user_id), 'Guru'),
         COALESCE(t.jabatan, t.subject, 'Guru'), t.fingerprint_pin, t.school_id
    FROM public.teachers t
   WHERE t.fingerprint_pin IS NOT NULL AND t.fingerprint_pin <> ''
     AND (p_all OR t.school_id IS NOT DISTINCT FROM p_school);
$$;
REVOKE ALL ON FUNCTION public._piket_people(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Deteksi absen tanpa jadwal (hanya guru/staf ber-PIN; siswa tidak ikut)
--  malam        : ada ketukan antara night_detect_start (hari D) s/d night_checkout_start (D+1) => masuk;
--                 ketukan pertama sesudahnya s/d night_window_end => pulang. (Ketukan pagi saja = datang kerja biasa, diabaikan)
--  sabtu_minggu : ketukan di Sabtu/Minggu dalam jendela weekend_*; masuk = sebelum weekend_checkout_start, pulang = sesudahnya
CREATE OR REPLACE FUNCTION public._piket_detect(p_from date, p_to date, p_shift text, p_school uuid, p_all boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; c integer;
BEGIN
  IF p_shift IS NULL OR p_shift = 'malam' THEN
    INSERT INTO public.piket_unscheduled (school_id, shift_type, duty_date, person_type, person_key, staff_id, teacher_id, person_name, position, fingerprint_pin, check_in_at, check_out_at)
    SELECT x.pschool, 'malam', x.d, x.ptype, x.pid::text,
           CASE WHEN x.ptype = 'staff' THEN x.pid END, CASE WHEN x.ptype = 'teacher' THEN x.pid END,
           x.pname, x.pposition, x.ppin, x.ci, x.co
      FROM (
        SELECT dd.d, pe.ptype, pe.pid, pe.pname, pe.pposition, pe.ppin, pe.pschool,
               min(l.punched_at) FILTER (WHERE l.punched_at <  w.split_at) AS ci,
               min(l.punched_at) FILTER (WHERE l.punched_at >= w.split_at) AS co
          FROM generate_series(0, p_to - p_from) g(i)
          CROSS JOIN LATERAL (SELECT (p_from + g.i) AS d) dd
          CROSS JOIN public.piket_settings s
          CROSS JOIN LATERAL (SELECT ((dd.d + s.night_detect_start) AT TIME ZONE 'Asia/Jakarta') AS ev_start,
                                     (((dd.d + 1) + s.night_checkout_start) AT TIME ZONE 'Asia/Jakarta') AS split_at,
                                     (((dd.d + 1) + s.night_window_end) AT TIME ZONE 'Asia/Jakarta') AS w_end) w
          JOIN public._piket_people(p_school, p_all) pe ON true
          JOIN public.fingerprint_logs l ON l.pin = pe.ppin AND l.punched_at >= w.ev_start AND l.punched_at <= w.w_end
         WHERE s.id = 1
         GROUP BY dd.d, pe.ptype, pe.pid, pe.pname, pe.pposition, pe.ppin, pe.pschool, w.split_at
        HAVING min(l.punched_at) FILTER (WHERE l.punched_at < w.split_at) IS NOT NULL
      ) x
     WHERE NOT EXISTS (SELECT 1 FROM public.piket_duties d
                        WHERE d.shift_type = 'malam' AND d.duty_date = x.d
                          AND ((x.ptype = 'staff' AND d.staff_id = x.pid) OR (x.ptype = 'teacher' AND d.teacher_id = x.pid)))
    ON CONFLICT (shift_type, duty_date, person_key) DO UPDATE
      SET check_in_at = EXCLUDED.check_in_at, check_out_at = EXCLUDED.check_out_at
      WHERE public.piket_unscheduled.status = 'menunggu';
    GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  END IF;

  IF p_shift IS NULL OR p_shift = 'sabtu_minggu' THEN
    INSERT INTO public.piket_unscheduled (school_id, shift_type, duty_date, person_type, person_key, staff_id, teacher_id, person_name, position, fingerprint_pin, check_in_at, check_out_at)
    SELECT x.pschool, 'sabtu_minggu', x.d, x.ptype, x.pid::text,
           CASE WHEN x.ptype = 'staff' THEN x.pid END, CASE WHEN x.ptype = 'teacher' THEN x.pid END,
           x.pname, x.pposition, x.ppin, x.ci, x.co
      FROM (
        SELECT dd.d, pe.ptype, pe.pid, pe.pname, pe.pposition, pe.ppin, pe.pschool,
               min(l.punched_at) FILTER (WHERE l.punched_at <  w.split_at) AS ci,
               min(l.punched_at) FILTER (WHERE l.punched_at >= w.split_at) AS co
          FROM generate_series(0, p_to - p_from) g(i)
          CROSS JOIN LATERAL (SELECT (p_from + g.i) AS d) dd
          CROSS JOIN public.piket_settings s
          CROSS JOIN LATERAL (SELECT ((dd.d + s.weekend_window_start) AT TIME ZONE 'Asia/Jakarta') AS w_start,
                                     ((dd.d + s.weekend_window_end) AT TIME ZONE 'Asia/Jakarta') AS w_end,
                                     ((dd.d + s.weekend_checkout_start) AT TIME ZONE 'Asia/Jakarta') AS split_at) w
          JOIN public._piket_people(p_school, p_all) pe ON true
          JOIN public.fingerprint_logs l ON l.pin = pe.ppin AND l.punched_at >= w.w_start AND l.punched_at <= w.w_end
         WHERE s.id = 1 AND EXTRACT(DOW FROM dd.d) IN (0, 6)
         GROUP BY dd.d, pe.ptype, pe.pid, pe.pname, pe.pposition, pe.ppin, pe.pschool, w.split_at
      ) x
     WHERE NOT EXISTS (SELECT 1 FROM public.piket_duties d
                        WHERE d.shift_type = 'sabtu_minggu' AND d.duty_date = x.d
                          AND ((x.ptype = 'staff' AND d.staff_id = x.pid) OR (x.ptype = 'teacher' AND d.teacher_id = x.pid)))
    ON CONFLICT (shift_type, duty_date, person_key) DO UPDATE
      SET check_in_at = EXCLUDED.check_in_at, check_out_at = EXCLUDED.check_out_at
      WHERE public.piket_unscheduled.status = 'menunggu';
    GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  END IF;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._piket_detect(date, date, text, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Sinkron piket sekarang sekaligus mendeteksi absen tanpa jadwal
CREATE OR REPLACE FUNCTION public.piket_sync(p_from date, p_to date, p_shift text DEFAULT NULL, p_reset_manual boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0; school uuid := public.get_user_school_id();
BEGIN
  IF NOT public.is_piket_manager() THEN RAISE EXCEPTION 'Hanya admin atau bendahara yang dapat menarik data fingerprint'; END IF;
  FOR r IN
    SELECT id FROM public.piket_duties
    WHERE duty_date BETWEEN p_from AND p_to
      AND (p_shift IS NULL OR shift_type = p_shift)
      AND (public.is_super_admin() OR school_id IS NOT DISTINCT FROM school)
  LOOP
    IF public._piket_recalc(r.id, p_reset_manual) THEN n := n + 1; END IF;
  END LOOP;
  PERFORM public._piket_detect(p_from, p_to, p_shift, school, public.is_super_admin());
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.piket_sync(date, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piket_sync(date, date, text, boolean) TO authenticated;

-- Keputusan admin/bendahara: 'hitung' | 'abaikan' | 'kembalikan' (dari diabaikan ke menunggu)
CREATE OR REPLACE FUNCTION public.piket_unscheduled_decide(p_id uuid, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u record;
BEGIN
  IF NOT public.is_piket_manager() THEN RAISE EXCEPTION 'Hanya admin atau bendahara'; END IF;
  SELECT * INTO u FROM public.piket_unscheduled WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Data tidak ditemukan'; END IF;
  IF NOT (public.is_super_admin() OR u.school_id IS NOT DISTINCT FROM public.get_user_school_id()) THEN
    RAISE EXCEPTION 'Tidak berwenang';
  END IF;

  IF p_action = 'hitung' THEN
    IF u.status = 'dihitung' THEN RETURN; END IF;
    -- source 'manual': keputusan final, tidak ditimpa sinkron fingerprint berikutnya
    INSERT INTO public.piket_duties (school_id, shift_type, duty_date, person_type, staff_id, teacher_id, person_name, position,
                                     fingerprint_pin, status, check_in_at, check_out_at, source, notes, created_by)
    VALUES (u.school_id, u.shift_type, u.duty_date, u.person_type, u.staff_id, u.teacher_id, u.person_name, u.position,
            u.fingerprint_pin, 'hadir', u.check_in_at, u.check_out_at, 'manual', 'Dikonfirmasi: absen tanpa jadwal', auth.uid())
    ON CONFLICT DO NOTHING;
    UPDATE public.piket_unscheduled SET status = 'dihitung', decided_by = auth.uid(), decided_at = now() WHERE id = p_id;
  ELSIF p_action = 'abaikan' THEN
    IF u.status = 'dihitung' THEN RAISE EXCEPTION 'Sudah dihitung; hapus jadwalnya di daftar piket bila perlu'; END IF;
    UPDATE public.piket_unscheduled SET status = 'diabaikan', decided_by = auth.uid(), decided_at = now() WHERE id = p_id;
  ELSIF p_action = 'kembalikan' THEN
    IF u.status <> 'diabaikan' THEN RAISE EXCEPTION 'Hanya yang diabaikan yang bisa dikembalikan'; END IF;
    UPDATE public.piket_unscheduled SET status = 'menunggu', decided_by = NULL, decided_at = NULL WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Aksi tidak dikenal';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.piket_unscheduled_decide(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piket_unscheduled_decide(uuid, text) TO authenticated;
