-- Generate PIN mesin fingerprint (angka urut, unik di antara siswa DAN guru; maksimal 9 digit).
-- p_kind: 'students' | 'teachers'. p_ids: bila diisi hanya orang-orang tsb, bila NULL semua yang belum punya PIN.
-- Mengembalikan jumlah PIN yang dibuat. Yang sudah punya PIN tidak diubah.
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

  PERFORM pg_advisory_xact_lock(778801);   -- cegah dua proses generate bersamaan

  SELECT COALESCE(max(x), 0) + 1 INTO v_next FROM (
    SELECT fingerprint_pin::bigint AS x FROM public.students WHERE fingerprint_pin ~ '^[0-9]{1,9}$'
    UNION ALL
    SELECT fingerprint_pin::bigint FROM public.teachers WHERE fingerprint_pin ~ '^[0-9]{1,9}$'
  ) t;

  IF p_kind = 'students' THEN
    FOR r IN
      SELECT s.id FROM public.students s
      LEFT JOIN public.classes c ON c.id = s.class_id
      WHERE s.fingerprint_pin IS NULL AND (s.status IS NULL OR s.status = 'aktif')
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
      WHERE t.fingerprint_pin IS NULL AND (p_ids IS NULL OR t.id = ANY(p_ids))
      ORDER BY t.full_name
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
