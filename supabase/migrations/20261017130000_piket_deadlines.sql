-- Aturan keterangan piket: tiap status hanya mencatat SATU ketukan pertama.
--   masuk  = ketukan pertama sebelum jam mulai absen pulang
--   pulang = ketukan pertama pada/setelah jam mulai absen pulang
-- Terlambat: hanya absen pulang, atau absen masuk melewati batas masuk.
-- Pulang Sebelum Waktunya: hanya absen masuk tanpa absen pulang. (keterangan dihitung di aplikasi)
ALTER TABLE public.piket_settings
  ADD COLUMN IF NOT EXISTS night_checkin_deadline   time NOT NULL DEFAULT '20:00',  -- batas absen masuk piket malam (hari D)
  ADD COLUMN IF NOT EXISTS night_checkout_start     time NOT NULL DEFAULT '05:00',  -- absen pulang dihitung mulai jam ini (hari D+1)
  ADD COLUMN IF NOT EXISTS weekend_checkin_deadline time NOT NULL DEFAULT '08:00',  -- batas absen masuk Sabtu/Minggu
  ADD COLUMN IF NOT EXISTS weekend_checkout_start   time NOT NULL DEFAULT '14:00';  -- absen pulang dihitung mulai jam ini

CREATE OR REPLACE FUNCTION public._piket_recalc(_duty uuid, _force boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record; s record; w_start timestamptz; w_end timestamptz; split_at timestamptz;
  v_pin text; ci timestamptz; co timestamptz;
BEGIN
  SELECT * INTO d FROM public.piket_duties WHERE id = _duty;
  IF NOT FOUND THEN RETURN false; END IF;
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
    IF _force THEN
      UPDATE public.piket_duties SET check_in_at = NULL, check_out_at = NULL, status = 'dijadwalkan', source = 'fingerprint' WHERE id = d.id;
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  UPDATE public.piket_duties
     SET check_in_at = ci, check_out_at = co, status = 'hadir', source = 'fingerprint'
   WHERE id = d.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._piket_recalc(uuid, boolean) FROM PUBLIC, anon, authenticated;
