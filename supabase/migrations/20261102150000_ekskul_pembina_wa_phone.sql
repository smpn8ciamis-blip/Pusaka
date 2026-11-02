-- =====================================================================
-- Pengaturan Pembina Ekskul: kelola (tambah / ubah / hapus) No. WhatsApp pembina.
-- Bot WhatsApp mengenali pembina dari nomor HP di profil akun (atau data staf), jadi
-- kesiswaan/admin perlu bisa mengisinya langsung dari menu Pembina Ekskul.
--   * get_ekskul_assignments() kini mengembalikan kolom `phone`.
--   * set_ekskul_pembina_phone(user, nomor): nomor kosong = hapus. Hanya untuk akun yang
--     SUDAH ditugaskan sebagai pembina di sekolah yang sama; nomor disimpan format 08xxxxxxxxxx.
-- Aman dijalankan ulang.
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_ekskul_assignments();

CREATE OR REPLACE FUNCTION public.get_ekskul_assignments()
RETURNS TABLE (
  instructor_id uuid,
  coach_id uuid,
  extracurricular_type_id uuid,
  user_id uuid,
  full_name text,
  nip text,
  nuptk text,
  pangkat_golongan text,
  jabatan text,
  email text,
  has_account boolean,
  phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, c.id, i.extracurricular_type_id, c.user_id,
    i.name, i.nip, i.nuptk, i.pangkat_golongan, i.jabatan,
    p.email, (c.id IS NOT NULL),
    COALESCE(NULLIF(p.phone, ''), (SELECT st.phone FROM public.staff st WHERE st.user_id = c.user_id AND NULLIF(st.phone, '') IS NOT NULL LIMIT 1))
  FROM public.extracurricular_instructors i
  LEFT JOIN public.extracurricular_coaches c ON c.instructor_id = i.id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE i.is_active
    AND (i.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (
      public.has_role(auth.uid(), 'kesiswaan')
      OR public.has_role(auth.uid(), 'admin')
      OR public.is_super_admin()
    )
  UNION ALL
  -- akun pembina lama (tanpa data instructor)
  SELECT
    NULL::uuid, c.id, c.extracurricular_type_id, c.user_id,
    p.full_name, NULL, NULL, NULL, NULL,
    p.email, true,
    COALESCE(NULLIF(p.phone, ''), (SELECT st.phone FROM public.staff st WHERE st.user_id = c.user_id AND NULLIF(st.phone, '') IS NOT NULL LIMIT 1))
  FROM public.extracurricular_coaches c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE c.instructor_id IS NULL
    AND (c.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (
      public.has_role(auth.uid(), 'kesiswaan')
      OR public.has_role(auth.uid(), 'admin')
      OR public.is_super_admin()
    )
  ORDER BY 5
$$;

REVOKE ALL ON FUNCTION public.get_ekskul_assignments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ekskul_assignments() TO authenticated;

-- Tambah / ubah / hapus No. WhatsApp pembina ----------------------------------------------
CREATE OR REPLACE FUNCTION public.set_ekskul_pembina_phone(_user_id uuid, _phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_digits text;
  v_intl text;
  v_local text;
  v_phone text;
  v_dupe text;
  v_n int := 0;
  v_m int := 0;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'kesiswaan')
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Tidak memiliki akses mengubah nomor WhatsApp pembina' USING ERRCODE = '42501';
  END IF;

  -- hanya akun yang sudah ditugaskan sebagai pembina di sekolah ini
  IF NOT EXISTS (
    SELECT 1 FROM public.extracurricular_coaches c
    WHERE c.user_id = _user_id AND (c.school_id = v_school OR public.is_super_admin())
  ) THEN
    RAISE EXCEPTION 'Akun ini bukan pembina ekskul di sekolah Anda' USING ERRCODE = 'P0002';
  END IF;

  v_digits := regexp_replace(COALESCE(_phone, ''), '\D', '', 'g');
  IF v_digits = '' THEN
    v_phone := NULL;                                           -- hapus nomor
  ELSE
    IF v_digits LIKE '62%' THEN v_intl := v_digits;
    ELSIF v_digits LIKE '0%' THEN v_intl := '62' || substr(v_digits, 2);
    ELSIF v_digits LIKE '8%' THEN v_intl := '62' || v_digits;
    ELSE v_intl := NULL; END IF;
    IF v_intl IS NULL OR v_intl NOT LIKE '628%' OR length(v_intl) < 11 OR length(v_intl) > 15 THEN
      RAISE EXCEPTION 'Nomor WhatsApp tidak valid. Contoh: 081234567890' USING ERRCODE = '22023';
    END IF;
    v_local := '0' || substr(v_intl, 3);
    v_phone := v_local;

    -- satu nomor = satu akun, agar bot tidak salah mengenali pengirim
    SELECT x.full_name INTO v_dupe FROM (
      SELECT p.id AS uid, p.full_name, p.phone FROM public.profiles p
      UNION ALL
      SELECT s.user_id, s.full_name, s.phone FROM public.staff s WHERE s.user_id IS NOT NULL
    ) x
    WHERE x.uid <> _user_id AND x.phone IS NOT NULL
      AND regexp_replace(x.phone, '\D', '', 'g') IN (v_intl, v_local, substr(v_intl, 3))
    LIMIT 1;
    IF v_dupe IS NOT NULL THEN
      RAISE EXCEPTION 'Nomor ini sudah dipakai akun lain (%).', v_dupe USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.profiles SET phone = v_phone WHERE id = _user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.staff SET phone = v_phone WHERE user_id = _user_id;
  GET DIAGNOSTICS v_m = ROW_COUNT;
  IF v_n + v_m = 0 THEN
    RAISE EXCEPTION 'Data akun pembina tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('phone', v_phone);
END;
$$;

REVOKE ALL ON FUNCTION public.set_ekskul_pembina_phone(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ekskul_pembina_phone(uuid, text) TO authenticated;
