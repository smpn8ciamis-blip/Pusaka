-- Pembersihan: absen tanpa jadwal memakai tabel piket_unscheduled (migrasi 20261018100000_piket_unscheduled).
-- Migrasi alternatif 20261018100000_piket_konfirmasi (status 'konfirmasi'/'ditolak' di piket_duties) dihapus dari repo;
-- bila sudah terlanjur dijalankan, skrip ini mengembalikan fungsi ke perilaku semula dan membuang baris sisa.
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

CREATE OR REPLACE FUNCTION public.piket_on_punch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; jd date := (NEW.punched_at AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
  FOR r IN
    SELECT d.id FROM public.piket_duties d
    LEFT JOIN public.staff st ON st.id = d.staff_id
    LEFT JOIN public.teachers t ON t.id = d.teacher_id
    WHERE d.source <> 'manual' AND d.duty_date BETWEEN jd - 1 AND jd
      AND COALESCE(NULLIF(d.fingerprint_pin,''), st.fingerprint_pin, t.fingerprint_pin) = NEW.pin
  LOOP
    PERFORM public._piket_recalc(r.id, false);
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'piket_on_punch: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public._piket_punch_covered(uuid, uuid, timestamptz);
DELETE FROM public.piket_duties WHERE status IN ('konfirmasi', 'ditolak');
