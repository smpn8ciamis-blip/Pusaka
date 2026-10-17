-- Log ketukan piket milik sendiri (guru / staf) beserta jenis verifikasi (sidik jari / wajah).
-- fingerprint_logs hanya terbaca admin, jadi akun guru/staf membacanya lewat RPC ini
-- yang hanya mengembalikan ketukan untuk jadwal piket milik pemanggil.
CREATE OR REPLACE FUNCTION public.my_piket_punches(p_from date, p_to date)
RETURNS TABLE (duty_id uuid, punched_at timestamptz, verify_type integer, device_sn text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
       AND ((pd.staff_id IS NOT NULL AND pd.staff_id = public.my_staff_id())
         OR (pd.teacher_id IS NOT NULL AND pd.teacher_id = public.my_teacher_id()))
  )
  SELECT d.id, l.punched_at, l.verify_type, l.device_sn
    FROM d
    JOIN public.fingerprint_logs l
      ON d.pin IS NOT NULL AND l.pin = d.pin AND l.punched_at BETWEEN d.w_start AND d.w_end
   ORDER BY d.id, l.punched_at;
$$;
REVOKE ALL ON FUNCTION public.my_piket_punches(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_piket_punches(date, date) TO authenticated;
