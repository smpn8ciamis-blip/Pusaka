-- Pemetaan PIN fingerprint untuk STAF (tata usaha & karyawan): daftar, generate PIN, dan nomor urut unik lintas siswa/guru/staf.

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
  IF p_kind NOT IN ('students', 'teachers', 'staff') THEN
    RAISE EXCEPTION 'Jenis tidak valid';
  END IF;

  PERFORM pg_advisory_xact_lock(778801);

  SELECT COALESCE(max(x), 0) + 1 INTO v_next FROM (
    SELECT fingerprint_pin::bigint AS x FROM public.students WHERE fingerprint_pin ~ '^[0-9]{1,9}$'
    UNION ALL
    SELECT fingerprint_pin::bigint FROM public.teachers WHERE fingerprint_pin ~ '^[0-9]{1,9}$'
    UNION ALL
    SELECT fingerprint_pin::bigint FROM public.staff WHERE fingerprint_pin ~ '^[0-9]{1,9}$'
  ) t;

  IF p_kind = 'students' THEN
    FOR r IN
      SELECT s.id FROM public.students s
      LEFT JOIN public.classes c ON c.id = s.class_id
      WHERE s.fingerprint_pin IS NULL AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
        AND (p_ids IS NULL OR s.id = ANY(p_ids))
      ORDER BY c.name NULLS LAST, s.full_name
    LOOP
      IF v_next > 999999999 THEN RAISE EXCEPTION 'PIN melebihi 9 digit'; END IF;
      UPDATE public.students SET fingerprint_pin = v_next::text WHERE id = r.id;
      v_next := v_next + 1; n := n + 1;
    END LOOP;
  ELSIF p_kind = 'teachers' THEN
    FOR r IN
      SELECT t.id FROM public.teachers t
      LEFT JOIN public.profiles p ON p.id = t.user_id
      WHERE t.fingerprint_pin IS NULL AND (p_ids IS NULL OR t.id = ANY(p_ids))
      ORDER BY p.full_name NULLS LAST
    LOOP
      IF v_next > 999999999 THEN RAISE EXCEPTION 'PIN melebihi 9 digit'; END IF;
      UPDATE public.teachers SET fingerprint_pin = v_next::text WHERE id = r.id;
      v_next := v_next + 1; n := n + 1;
    END LOOP;
  ELSE
    FOR r IN
      SELECT st.id FROM public.staff st
      WHERE st.fingerprint_pin IS NULL AND st.status = 'aktif'
        AND (public.is_super_admin() OR st.school_id IS NOT DISTINCT FROM public.get_user_school_id())
        AND (p_ids IS NULL OR st.id = ANY(p_ids))
      ORDER BY st.full_name
    LOOP
      IF v_next > 999999999 THEN RAISE EXCEPTION 'PIN melebihi 9 digit'; END IF;
      UPDATE public.staff SET fingerprint_pin = v_next::text WHERE id = r.id;
      v_next := v_next + 1; n := n + 1;
    END LOOP;
  END IF;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.fp_generate_pins(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_generate_pins(text, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fp_list_people(p_kind text, p_q text DEFAULT NULL, p_only_empty boolean DEFAULT false,
                                                  p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE (id uuid, full_name text, class_name text, nis text, nisn text, nip text, fingerprint_pin text, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya admin';
  END IF;
  IF p_kind = 'students' THEN
    RETURN QUERY
      SELECT s.id, s.full_name, c.name, s.nis, s.nisn, NULL::text, s.fingerprint_pin, count(*) OVER ()
      FROM public.students s
      LEFT JOIN public.classes c ON c.id = s.class_id
      WHERE s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
        AND (p_q IS NULL OR btrim(p_q) = '' OR s.full_name ILIKE '%' || btrim(p_q) || '%')
        AND (NOT p_only_empty OR s.fingerprint_pin IS NULL)
      ORDER BY c.name NULLS LAST, s.full_name
      LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
  ELSIF p_kind = 'teachers' THEN
    RETURN QUERY
      SELECT t.id, p.full_name, NULL::text, NULL::text, NULL::text, t.nip, t.fingerprint_pin, count(*) OVER ()
      FROM public.teachers t
      LEFT JOIN public.profiles p ON p.id = t.user_id
      WHERE (p_q IS NULL OR btrim(p_q) = '' OR p.full_name ILIKE '%' || btrim(p_q) || '%')
        AND (NOT p_only_empty OR t.fingerprint_pin IS NULL)
      ORDER BY p.full_name NULLS LAST
      LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
  ELSIF p_kind = 'staff' THEN
    RETURN QUERY
      SELECT st.id, st.full_name, CASE st.staff_type WHEN 'tata_usaha' THEN 'Tata Usaha' ELSE 'Karyawan' END,
             NULL::text, NULL::text, st.nip, st.fingerprint_pin, count(*) OVER ()
      FROM public.staff st
      WHERE st.status = 'aktif'
        AND (public.is_super_admin() OR st.school_id IS NOT DISTINCT FROM public.get_user_school_id())
        AND (p_q IS NULL OR btrim(p_q) = '' OR st.full_name ILIKE '%' || btrim(p_q) || '%')
        AND (NOT p_only_empty OR st.fingerprint_pin IS NULL)
      ORDER BY st.staff_type, st.full_name
      LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
  ELSE
    RAISE EXCEPTION 'Jenis tidak valid';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fp_list_people(text, text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_list_people(text, text, boolean, integer, integer) TO authenticated, service_role;
