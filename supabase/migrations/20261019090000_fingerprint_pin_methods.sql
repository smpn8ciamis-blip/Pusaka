-- Metode absen yang pernah dipakai per PIN (sidik jari / wajah), untuk menandai siapa yang sudah merekam wajah di mesin.
-- fingerprint_logs hanya bisa dibaca admin; RPC ini hanya mengembalikan ringkasan per PIN.
CREATE OR REPLACE FUNCTION public.fp_pin_methods()
RETURNS TABLE (pin text, finger_count bigint, face_count bigint, last_face_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Tidak berwenang';
  END IF;
  RETURN QUERY
  SELECT l.pin,
         count(*) FILTER (WHERE l.verify_type = 1),
         count(*) FILTER (WHERE l.verify_type = 15),
         max(l.punched_at) FILTER (WHERE l.verify_type = 15)
    FROM public.fingerprint_logs l
   GROUP BY l.pin;
END;
$$;
REVOKE ALL ON FUNCTION public.fp_pin_methods() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_pin_methods() TO authenticated;
