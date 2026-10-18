-- Ketukan piket dari guru/staf yang TIDAK punya jadwal tidak langsung dihitung:
-- dibuat baris berstatus 'konfirmasi' (menunggu keputusan admin/bendahara). Dikonfirmasi -> 'hadir' (dihitung di daftar hadir & kwitansi),
-- diabaikan -> 'ditolak' (tidak dihitung dan tidak dibuat ulang).
ALTER TABLE public.piket_duties DROP CONSTRAINT IF EXISTS piket_duties_status_check;
ALTER TABLE public.piket_duties ADD CONSTRAINT piket_duties_status_check
  CHECK (status IN ('dijadwalkan','hadir','tidak_hadir','izin','konfirmasi','ditolak'));

-- Ketukan malam tanpa jadwal baru dianggap piket bila jam >= ini (menghindari guru yang pulang sore)
ALTER TABLE public.piket_settings ADD COLUMN IF NOT EXISTS night_candidate_from time NOT NULL DEFAULT '18:00';

-- Hitung ulang: baris 'ditolak' tidak disentuh; baris 'konfirmasi' hanya diperbarui jam ketuknya (status tetap)
CREATE OR REPLACE FUNCTION public._piket_recalc(_duty uuid, _force boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record; s record; w_start timestamptz; w_end timestamptz; split_at timestamptz;
  v_pin text; ci timestamptz; co timestamptz; v_status text;
BEGIN
  SELECT * INTO d FROM public.piket_duties WHERE id = _duty;
  IF NOT FOUND THEN RETURN false; END IF;
  IF d.status = 'ditolak' THEN RETURN false; END IF;
  IF d.source = 'manual' AND NOT _force THEN RETURN false; END IF;
  SELECT * INTO s FROM public.piket_settings WHERE id = 1;

  v_pin := COALESCE(NULLIF(d.fingerprint_pin,''),
                  (SELECT fingerprint_pin FROM public.staff WHERE id = d.staff_id),
                  (SELECT fingerprint_pin FROM public.teachers WHERE id = d.teacher_id));
  IF v_pin IS NULL OR v_pin = '' THEN RETURN false; END IF;

  IF d.shift_type = 'malam' THEN
    w_start  := ((d.duty_date + s.night_window_start) AT TIME ZONE 'Asia/Jakarta');
    w_end    := (((d.duty_date + 1) + s.night_window_end) AT TIME ZONE 'Asia/Jakarta');
    split_at := (((d.duty_date + 1) + s.night_checkout_start) AT TIME ZONE 'Asia/Jakarta');
  ELSE
    w_start  := ((d.duty_date + s.weekend_window_start) AT TIME ZONE 'Asia/Jakarta');
    w_end    := ((d.duty_date + s.weekend_window_end) AT TIME ZONE 'Asia/Jakarta');
    split_at := ((d.duty_date + s.weekend_checkout_start) AT TIME ZONE 'Asia/Jakarta');
  END IF;

  SELECT min(punched_at) FILTER (WHERE punched_at <  split_at),
         min(punched_at) FILTER (WHERE punched_at >= split_at)
    INTO ci, co
  FROM public.fingerprint_logs WHERE fingerprint_logs.pin = v_pin AND punched_at BETWEEN w_start AND w_end;

  IF ci IS NULL AND co IS NULL THEN
    IF _force AND d.status <> 'konfirmasi' THEN
      UPDATE public.piket_duties SET check_in_at = NULL, check_out_at = NULL, status = 'dijadwalkan', source = 'fingerprint' WHERE id = d.id;
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  v_status := CASE WHEN d.status = 'konfirmasi' THEN 'konfirmasi' ELSE 'hadir' END;
  UPDATE public.piket_duties
     SET check_in_at = ci, check_out_at = co, status = v_status, source = 'fingerprint'
   WHERE id = d.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._piket_recalc(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Apakah ketukan jatuh dalam jendela piket yang sudah ada (jadwal apa pun, termasuk konfirmasi/ditolak) milik orang itu?
CREATE OR REPLACE FUNCTION public._piket_punch_covered(p_staff uuid, p_teacher uuid, p_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.piket_duties d CROSS JOIN public.piket_settings s
     WHERE s.id = 1
       AND d.duty_date BETWEEN ((p_at AT TIME ZONE 'Asia/Jakarta')::date - 1) AND (p_at AT TIME ZONE 'Asia/Jakarta')::date
       AND ((p_staff IS NOT NULL AND d.staff_id = p_staff) OR (p_teacher IS NOT NULL AND d.teacher_id = p_teacher))
       AND p_at BETWEEN
             CASE WHEN d.shift_type = 'malam' THEN ((d.duty_date + s.night_window_start) AT TIME ZONE 'Asia/Jakarta')
                  ELSE ((d.duty_date + s.weekend_window_start) AT TIME ZONE 'Asia/Jakarta') END
         AND CASE WHEN d.shift_type = 'malam' THEN (((d.duty_date + 1) + s.night_window_end) AT TIME ZONE 'Asia/Jakarta')
                  ELSE ((d.duty_date + s.weekend_window_end) AT TIME ZONE 'Asia/Jakarta') END
  );
$$;

-- Real-time: perbarui jadwal yang cocok; bila tidak ada jadwal, buat calon 'konfirmasi' (tidak boleh menggagalkan absensi)
CREATE OR REPLACE FUNCTION public.piket_on_punch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; s record; st record; t record;
  jd date := (NEW.punched_at AT TIME ZONE 'Asia/Jakarta')::date;
  jt time := (NEW.punched_at AT TIME ZONE 'Asia/Jakarta')::time;
  v_staff uuid; v_teacher uuid; v_name text; v_pos text; v_school uuid;
  v_shift text; v_date date; v_new uuid;
BEGIN
  FOR r IN
    SELECT d.id FROM public.piket_duties d
    LEFT JOIN public.staff st2 ON st2.id = d.staff_id
    LEFT JOIN public.teachers t2 ON t2.id = d.teacher_id
    WHERE d.source <> 'manual' AND d.status <> 'ditolak' AND d.duty_date BETWEEN jd - 1 AND jd
      AND COALESCE(NULLIF(d.fingerprint_pin,''), st2.fingerprint_pin, t2.fingerprint_pin) = NEW.pin
  LOOP
    PERFORM public._piket_recalc(r.id, false);
  END LOOP;

  -- Deteksi ketukan piket tanpa jadwal (hanya guru/staf ber-PIN)
  SELECT * INTO st FROM public.staff WHERE fingerprint_pin = NEW.pin AND status <> 'nonaktif' LIMIT 1;
  IF FOUND THEN
    v_staff := st.id; v_name := st.full_name; v_pos := COALESCE(st.position, CASE WHEN st.staff_type = 'tata_usaha' THEN 'Tata Usaha' ELSE 'Karyawan' END); v_school := st.school_id;
  ELSE
    SELECT * INTO t FROM public.teachers WHERE fingerprint_pin = NEW.pin LIMIT 1;
    IF NOT FOUND THEN RETURN NEW; END IF;
    v_teacher := t.id;
    v_school := (to_jsonb(t) ->> 'school_id')::uuid;
    v_pos := COALESCE(to_jsonb(t) ->> 'jabatan', to_jsonb(t) ->> 'subject', 'Guru');
    SELECT full_name INTO v_name FROM public.profiles WHERE id = t.user_id;
    v_name := COALESCE(v_name, 'Guru');
  END IF;

  IF public._piket_punch_covered(v_staff, v_teacher, NEW.punched_at) THEN RETURN NEW; END IF;

  SELECT * INTO s FROM public.piket_settings WHERE id = 1;
  IF EXTRACT(dow FROM jd) IN (0, 6) AND jt BETWEEN s.weekend_window_start AND s.weekend_window_end THEN
    v_shift := 'sabtu_minggu'; v_date := jd;
  ELSIF jt >= s.night_candidate_from THEN
    v_shift := 'malam'; v_date := jd;
  ELSIF jt < s.night_checkout_start THEN
    v_shift := 'malam'; v_date := jd - 1;
  END IF;
  IF v_shift IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.piket_duties (school_id, shift_type, duty_date, person_type, staff_id, teacher_id, person_name, position, status, source)
  VALUES (v_school, v_shift, v_date, CASE WHEN v_staff IS NOT NULL THEN 'staff' ELSE 'teacher' END, v_staff, v_teacher, v_name, v_pos, 'konfirmasi', 'fingerprint')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new;
  IF v_new IS NOT NULL THEN PERFORM public._piket_recalc(v_new, false); END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'piket_on_punch: %', SQLERRM;
  RETURN NEW;
END;
$$;
