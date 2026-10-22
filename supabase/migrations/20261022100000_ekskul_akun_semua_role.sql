-- Pilihan "Akun login" pembina ekskul memuat semua akun dari Akun Staff / Registrasi Staff:
-- tata_usaha, bendahara, staf, guru_piket, pembina_ekskul (juga yang belum punya data staff).

DROP FUNCTION IF EXISTS public.list_staff_accounts_for_ekskul();

CREATE OR REPLACE FUNCTION public.list_staff_accounts_for_ekskul()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  staff_type text,
  staff_position text,
  nip text,
  email text,
  source text,
  user_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.user_id, x.full_name, x.staff_type, x.staff_position, x.nip, x.email, x.source, x.user_role
  FROM (
    SELECT s.user_id, s.full_name, s.staff_type, s.position AS staff_position, s.nip,
           COALESCE(p.email, u.email, s.email) AS email, 'staff'::text AS source,
           (SELECT r.role::text FROM public.user_roles r WHERE r.user_id = s.user_id LIMIT 1) AS user_role
    FROM public.staff s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN auth.users u ON u.id = s.user_id
    WHERE s.user_id IS NOT NULL
      AND s.status = 'aktif'
      AND (s.school_id = public.get_user_school_id() OR public.is_super_admin())
    UNION ALL
    SELECT r.user_id,
           COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email),
           NULL::text, NULL::text, NULL::text,
           COALESCE(p.email, u.email), 'akun'::text, r.role::text
    FROM public.user_roles r
    JOIN auth.users u ON u.id = r.user_id
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.role::text IN ('pembina_ekskul', 'tata_usaha', 'bendahara', 'staf', 'guru_piket')
      AND (r.school_id = public.get_user_school_id() OR public.is_super_admin())
      AND NOT EXISTS (SELECT 1 FROM public.staff s2 WHERE s2.user_id = r.user_id AND s2.status = 'aktif')
  ) x
  WHERE public.has_role(auth.uid(), 'kesiswaan')
     OR public.has_role(auth.uid(), 'admin')
     OR public.is_super_admin()
  ORDER BY x.full_name
$$;

-- Penugasan: terima akun dengan role-role di atas
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

  SELECT s.full_name, s.nip, s.position
    INTO v_full_name, v_nip, v_position
  FROM public.staff s
  WHERE s.user_id = _user_id
    AND s.status = 'aktif'
    AND (s.school_id = v_school OR public.is_super_admin())
  LIMIT 1;
  v_found := FOUND;

  IF NOT v_found THEN
    SELECT COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email)
      INTO v_full_name
    FROM public.user_roles r
    JOIN auth.users u ON u.id = r.user_id
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id
      AND r.role::text IN ('pembina_ekskul', 'tata_usaha', 'bendahara', 'staf', 'guru_piket')
      AND (r.school_id = v_school OR public.is_super_admin())
    LIMIT 1;
    v_found := FOUND;
  END IF;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Akun tidak ditemukan atau tidak aktif' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  SELECT u.id, u.email, COALESCE(v_full_name, u.email)
  FROM auth.users u
  WHERE u.id = _user_id
  ON CONFLICT (id) DO NOTHING;

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
