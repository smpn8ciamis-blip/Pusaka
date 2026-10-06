-- ============================================================
-- Cetak Jurnal Ekstrakurikuler
--  * school_settings.wakasek_kesiswaan_teacher_id : guru yang menjabat Wakasek Kesiswaan
--    (menandatangani "Mengetahui" pada jurnal ekskul)
--  * get_ekskul_print_info(type_id) : data penandatangan untuk cetak
--    - daftar pembina aktif dari extracurricular_instructors
--    - data Wakasek Kesiswaan
--    Pembina tidak punya akses langsung ke tabel instructors/teachers,
--    jadi data diambil lewat fungsi ini.
-- ============================================================

ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS wakasek_kesiswaan_teacher_id uuid
  REFERENCES public.teachers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.get_ekskul_print_info(_type_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_wakasek_id uuid;
  v_wakasek jsonb;
  v_result jsonb;
BEGIN
  v_allowed :=
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(_type_id));

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Tidak memiliki akses ke data ekskul ini' USING ERRCODE = '42501';
  END IF;

  SELECT s.wakasek_kesiswaan_teacher_id
    INTO v_wakasek_id
  FROM public.school_settings s
  ORDER BY (s.school_id = public.get_user_school_id()) DESC NULLS LAST, s.created_at DESC
  LIMIT 1;

  IF v_wakasek_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'full_name', p.full_name,
             'nip', t.nip,
             'nuptk', t.nuptk,
             'pangkat_golongan', t.pangkat_golongan,
             'jabatan', t.jabatan
           )
      INTO v_wakasek
    FROM public.teachers t
    LEFT JOIN public.profiles p ON p.id = t.user_id
    WHERE t.id = v_wakasek_id;
  END IF;

  SELECT jsonb_build_object(
           'ekskul_name', et.name,
           'instructors', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id', i.id,
                        'name', i.name,
                        'nip', i.nip,
                        'nuptk', i.nuptk,
                        'pangkat_golongan', i.pangkat_golongan,
                        'jabatan', i.jabatan
                      ) ORDER BY i.name
                    )
             FROM public.extracurricular_instructors i
             WHERE i.extracurricular_type_id = et.id
               AND i.is_active
               AND (i.school_id = public.get_user_school_id() OR public.is_super_admin())
           ), '[]'::jsonb),
           'wakasek', v_wakasek
         )
    INTO v_result
  FROM public.extracurricular_types et
  WHERE et.id = _type_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ekskul_print_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ekskul_print_info(uuid) TO authenticated;
