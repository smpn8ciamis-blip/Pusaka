-- Daftar ketukan (waktu + jenis verifikasi: sidik jari / wajah / dll.) per jadwal piket.
-- fingerprint_logs hanya bisa dibaca admin, jadi bendahara/tata usaha membacanya lewat RPC ini.
CREATE OR REPLACE FUNCTION public.piket_punches(p_from date, p_to date, p_shift text DEFAULT NULL)
RETURNS TABLE (duty_id uuid, punched_at timestamptz, verify_type integer, device_sn text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_piket_manager() OR public.has_role(auth.uid(), 'tata_usaha')) THEN
    RAISE EXCEPTION 'Tidak berwenang';
  END IF;

  RETURN QUERY
  WITH s AS (SELECT * FROM public.piket_settings WHERE id = 1),
  d AS (
    SELECT pd.id,
           COALESCE(NULLIF(pd.fingerprint_pin, ''),
                    (SELECT st.fingerprint_pin FROM public.staff st WHERE st.id = pd.staff_id),
                    (SELECT t.fingerprint_pin FROM public.teachers t WHERE t.id = pd.teacher_id)) AS pin,
           CASE WHEN pd.shift_type = 'malam'
                THEN ((pd.duty_date + s.night_window_start) AT TIME ZONE 'Asia/Jakarta')
                ELSE ((pd.duty_date + s.weekend_window_start) AT TIME ZONE 'Asia/Jakarta') END AS w_start,
           CASE WHEN pd.shift_type = 'malam'
                THEN (((pd.duty_date + 1) + s.night_window_end) AT TIME ZONE 'Asia/Jakarta')
                ELSE ((pd.duty_date + s.weekend_window_end) AT TIME ZONE 'Asia/Jakarta') END AS w_end
      FROM public.piket_duties pd CROSS JOIN s
     WHERE pd.duty_date BETWEEN p_from AND p_to
       AND (p_shift IS NULL OR pd.shift_type = p_shift)
       AND (public.is_super_admin() OR pd.school_id IS NOT DISTINCT FROM public.get_user_school_id())
  )
  SELECT d.id, l.punched_at, l.verify_type, l.device_sn
    FROM d
    JOIN public.fingerprint_logs l
      ON l.pin = d.pin AND d.pin IS NOT NULL AND l.punched_at BETWEEN d.w_start AND d.w_end
   ORDER BY d.id, l.punched_at;
END;
$$;
REVOKE ALL ON FUNCTION public.piket_punches(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piket_punches(date, date, text) TO authenticated;
