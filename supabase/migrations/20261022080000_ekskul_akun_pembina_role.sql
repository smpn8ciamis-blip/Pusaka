-- Daftar "Akun login" pembina ekskul kini juga memuat akun ber-role pembina_ekskul
-- yang dibuat di menu Registrasi Akun (user_roles), selain akun Registrasi Staf.
-- Pemilihan memakai user_id (staf mungkin belum punya baris di tabel staff).

DROP FUNCTION IF EXISTS public.list_staff_accounts_for_ekskul();
DROP FUNCTION IF EXISTS public.assign_ekskul_pembina_akun(uuid, uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.list_staff_accounts_for_ekskul()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  staff_type text,
  staff_position text,
  nip text,
  email text,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.user_id, x.full_name, x.staff_type, x.staff_position, x.nip, x.email, x.source
  FROM (
    SELECT s.user_id, s.full_name, s.staff_type, s.position AS staff_position, s.nip,
           COALESCE(p.email, s.email) AS email, 'staff'::text AS source
    FROM public.staff s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.user_id IS NOT NULL
      AND s.status = 'aktif'
      AND (s.school_id = public.get_user_school_id() OR public.is_super_admin())
    UNION ALL
    SELECT r.user_id, COALESCE(NULLIF(btrim(p.full_name), ''), p.email), NULL::text, NULL::text, NULL::text,
           p.email, 'akun_pembina'::text
    FROM public.user_roles r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.role = 'pembina_ekskul'
      AND (r.school_id = public.get_user_school_id() OR public.is_super_admin())
      AND NOT EXISTS (SELECT 1 FROM public.staff s2 WHERE s2.user_id = r.user_id AND s2.status = 'aktif')
  ) x
  WHERE public.has_role(auth.uid(), 'kesiswaan')
     OR public.has_role(auth.uid(), 'admin')
     OR public.is_super_admin()
  ORDER BY x.full_name
$$;

CREATE OR REPLACE FUNCTION public.assign_ekskul_pembina_akun(
  _type_id uuid,
  _user_id uuid,
  _name text DEFAULT NULL,
  _nip text DEFAULT NULL,
  _nuptk text DEFAULT NULL,
  _pangkat_golongan text DEFAULT NULL,
  _jabatan text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_full_name text;
  v_nip text;
  v_position text;
  v_found boolean := false;
  v_res jsonb;
  v_instructor uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'kesiswaan')
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Tidak memiliki akses menugaskan pembina' USING ERRCODE = '42501';
  END IF;

  -- Akun staf (Registrasi Staf)
  SELECT s.full_name, s.nip, s.position
    INTO v_full_name, v_nip, v_position
  FROM public.staff s
  WHERE s.user_id = _user_id
    AND s.status = 'aktif'
    AND (s.school_id = v_school OR public.is_super_admin())
  LIMIT 1;
  v_found := FOUND;

  -- Akun ber-role pembina_ekskul (Registrasi Akun)
  IF NOT v_found THEN
    SELECT COALESCE(NULLIF(btrim(p.full_name), ''), p.email)
      INTO v_full_name
    FROM public.user_roles r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id
      AND r.role = 'pembina_ekskul'
      AND (r.school_id = v_school OR public.is_super_admin())
    LIMIT 1;
    v_found := FOUND;
  END IF;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Akun tidak ditemukan atau tidak aktif' USING ERRCODE = 'P0002';
  END IF;

  v_res := public.assign_ekskul_pembina(
    _type_id, NULL,
    COALESCE(NULLIF(btrim(_name), ''), v_full_name),
    COALESCE(NULLIF(btrim(_nip), ''), v_nip),
    _nuptk, _pangkat_golongan,
    COALESCE(NULLIF(btrim(_jabatan), ''), v_position)
  );
  v_instructor := (v_res ->> 'instructor_id')::uuid;

  INSERT INTO public.extracurricular_coaches (user_id, extracurricular_type_id, school_id, instructor_id)
  VALUES (_user_id, _type_id, v_school, v_instructor)
  ON CONFLICT (user_id, extracurricular_type_id)
  DO UPDATE SET instructor_id = EXCLUDED.instructor_id;

  RETURN jsonb_build_object('instructor_id', v_instructor, 'has_account', true);
END;
$$;

REVOKE ALL ON FUNCTION public.list_staff_accounts_for_ekskul() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_ekskul_pembina_akun(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_staff_accounts_for_ekskul() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_ekskul_pembina_akun(uuid, uuid, text, text, text, text, text) TO authenticated;
