-- ============================================================
-- Pembina ekskul (ketik manual) dapat dihubungkan ke AKUN LOGIN
-- yang dibuat di menu Registrasi Staf (tabel staff.user_id).
-- Akun terpilih mendapat baris extracurricular_coaches sehingga
-- is_ekskul_coach() memberi CRUD penuh Jurnal & Anggota Ekskul.
-- ============================================================

-- Daftar akun staf (yang sudah punya akun login) untuk dipilih
CREATE OR REPLACE FUNCTION public.list_staff_accounts_for_ekskul()
RETURNS TABLE (
  staff_id uuid,
  user_id uuid,
  full_name text,
  staff_type text,
  staff_position text,
  nip text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.user_id, s.full_name, s.staff_type, s.position, s.nip,
         COALESCE(p.email, s.email)
  FROM public.staff s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.user_id IS NOT NULL
    AND s.status = 'aktif'
    AND (s.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (
      public.has_role(auth.uid(), 'kesiswaan')
      OR public.has_role(auth.uid(), 'admin')
      OR public.is_super_admin()
    )
  ORDER BY s.full_name
$$;

-- Tugaskan pembina (data manual) + hubungkan ke akun staf
CREATE OR REPLACE FUNCTION public.assign_ekskul_pembina_akun(
  _type_id uuid,
  _staff_id uuid,
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
  v_user uuid;
  v_full_name text;
  v_nip text;
  v_position text;
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

  SELECT s.user_id, s.full_name, s.nip, s.position
    INTO v_user, v_full_name, v_nip, v_position
  FROM public.staff s
  WHERE s.id = _staff_id
    AND s.status = 'aktif'
    AND (s.school_id = v_school OR public.is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun staf tidak ditemukan atau tidak aktif' USING ERRCODE = 'P0002';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Staf ini belum memiliki akun login' USING ERRCODE = '22023';
  END IF;

  -- Simpan data pembina (nama dari isian; bila kosong pakai nama staf)
  v_res := public.assign_ekskul_pembina(
    _type_id, NULL,
    COALESCE(NULLIF(btrim(_name), ''), v_full_name),
    COALESCE(NULLIF(btrim(_nip), ''), v_nip),
    _nuptk, _pangkat_golongan,
    COALESCE(NULLIF(btrim(_jabatan), ''), v_position)
  );
  v_instructor := (v_res ->> 'instructor_id')::uuid;

  -- Beri akses akun
  INSERT INTO public.extracurricular_coaches (user_id, extracurricular_type_id, school_id, instructor_id)
  VALUES (v_user, _type_id, v_school, v_instructor)
  ON CONFLICT (user_id, extracurricular_type_id)
  DO UPDATE SET instructor_id = EXCLUDED.instructor_id;

  RETURN jsonb_build_object('instructor_id', v_instructor, 'has_account', true);
END;
$$;

REVOKE ALL ON FUNCTION public.list_staff_accounts_for_ekskul() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_ekskul_pembina_akun(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_staff_accounts_for_ekskul() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_ekskul_pembina_akun(uuid, uuid, text, text, text, text, text) TO authenticated;
