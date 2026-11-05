-- Tata usaha: akses penuh (lihat, tambah, ubah, hapus) pada menu Master Data yang ada di peran admin:
-- Guru, Staf, Siswa, Kelas, Tahun Pelajaran, Mutasi Masuk/Keluar, Alumni (tabel students).
-- Dibatasi ke sekolah pengguna sendiri. Tidak memberi hak mengelola peran/akun admin:
--   * user_roles: tata usaha hanya boleh MELIHAT (satu sekolah), tidak boleh mengubah.
--   * profiles: hanya boleh mengubah profil pengguna non-admin satu sekolah.
-- Aman dijalankan ulang.

-- 1. Kebijakan penuh untuk tabel master data --------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['teachers', 'students', 'classes', 'academic_years', 'staff', 'student_mutations'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tata_usaha_master_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.has_role(auth.uid(), ''tata_usaha'') AND school_id IS NOT DISTINCT FROM public.get_user_school_id()) '
      'WITH CHECK (public.has_role(auth.uid(), ''tata_usaha'') AND school_id IS NOT DISTINCT FROM public.get_user_school_id())',
      'tata_usaha_master_' || t, t);
  END LOOP;
END $$;

-- 2. user_roles: hanya baca (agar daftar guru/staf menampilkan peran yang benar) ---
DROP POLICY IF EXISTS "tata_usaha_read_user_roles" ON public.user_roles;
CREATE POLICY "tata_usaha_read_user_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tata_usaha') AND school_id IS NOT DISTINCT FROM public.get_user_school_id());

-- 3. profiles: ubah nama/telepon guru & staf (bukan admin), satu sekolah ----------
CREATE OR REPLACE FUNCTION public._tu_can_edit_profile(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'tata_usaha')
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p_user AND ur.school_id IS NOT DISTINCT FROM public.get_user_school_id())
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = p_user AND ur.role IN ('admin', 'super_admin'))
$$;
REVOKE ALL ON FUNCTION public._tu_can_edit_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._tu_can_edit_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "tata_usaha_update_profiles" ON public.profiles;
CREATE POLICY "tata_usaha_update_profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public._tu_can_edit_profile(id))
  WITH CHECK (public._tu_can_edit_profile(id));

-- 4. Mutasi Masuk: tata usaha ikut berhak (catatan, pengaturan, hapus catatan) -----
CREATE OR REPLACE FUNCTION public._mm_can_use()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan')
    OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin())
$$;
REVOKE ALL ON FUNCTION public._mm_can_use() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mm_can_use() TO authenticated;

DROP POLICY IF EXISTS "student_admissions_select" ON public.student_admissions;
CREATE POLICY "student_admissions_select" ON public.student_admissions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan')
         OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin());

DROP POLICY IF EXISTS "student_admissions_update" ON public.student_admissions;
CREATE POLICY "student_admissions_update" ON public.student_admissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan')
         OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan')
         OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin());

DROP POLICY IF EXISTS "student_admissions_delete" ON public.student_admissions;
CREATE POLICY "student_admissions_delete" ON public.student_admissions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin());

-- pengaturan pola NIS & "Penerimaan awal tahun ajaran": admin dan tata usaha
CREATE OR REPLACE FUNCTION public.mutasi_masuk_save_settings(p_pattern text, p_allow boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := public._mm_settings_id();
  v_pat text := btrim(coalesce(p_pattern, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya admin atau tata usaha yang boleh mengubah pengaturan ini';
  END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Pengaturan sekolah belum dibuat'; END IF;
  IF v_pat = '' OR char_length(v_pat) > 40 THEN RAISE EXCEPTION 'Pola NIS harus 1-40 karakter'; END IF;
  IF v_pat !~ '\{URUT(:[0-9]{1,2})?\}' OR
     (SELECT count(*) FROM regexp_matches(v_pat, '\{URUT(?::[0-9]{1,2})?\}', 'g')) <> 1 THEN
    RAISE EXCEPTION 'Pola NIS harus memuat tepat satu {URUT} atau {URUT:n}';
  END IF;
  IF regexp_replace(v_pat, '\{(TAHUN|YY|TINGKAT|URUT(:[0-9]{1,2})?)\}', '', 'g') ~ '[{}]' THEN
    RAISE EXCEPTION 'Pola NIS memuat token yang tidak dikenal';
  END IF;
  UPDATE public.school_settings
     SET nis_pattern = v_pat, allow_direct_student_insert = coalesce(p_allow, false)
   WHERE id = v_id;
  RETURN jsonb_build_object('nis_pattern', v_pat, 'allow_direct', coalesce(p_allow, false));
END;
$$;
REVOKE ALL ON FUNCTION public.mutasi_masuk_save_settings(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mutasi_masuk_save_settings(text, boolean) TO authenticated;
