-- Hak akses peran panitia_ujian. Jalankan SETELAH 20261119190000_panitia_ujian_peran.sql. Aman dijalankan ulang.
--
-- Ringkasnya:
--   * Nama ujian, jadwal ujian, dan pengaturan kartu ujian: hanya lewat fungsi exam_settings_get / exam_settings_save
--     (SECURITY DEFINER). Panitia TIDAK mendapat akses langsung ke tabel school_settings, sehingga kolom lain
--     (keuangan bendahara, token, dsb.) tetap tidak terbaca/terubah.
--   * Data siswa, kelas, dan mutasi: hanya BACA, terbatas ke sekolah panitia sendiri (dipakai denah, kartu, nomor ujian).

-- 1. Pemeriksa peran ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._exam_panitia_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (public.has_role(auth.uid(), 'panitia_ujian')
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_super_admin())
$$;
REVOKE ALL ON FUNCTION public._exam_panitia_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._exam_panitia_ok() TO authenticated;

-- 2. Baca pengaturan ujian (hanya kolom yang dibutuhkan halaman Administrasi Ujian) -----
CREATE OR REPLACE FUNCTION public.exam_settings_get()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_row public.school_settings%ROWTYPE;
  v_keys text[] := ARRAY[
    'id', 'school_id', 'school_name', 'school_address', 'school_phone', 'logo_url', 'right_logo_url',
    'district_name', 'city_name', 'academic_year', 'headmaster_name', 'headmaster_nip', 'headmaster_position',
    'school_stamp_url', 'headmaster_signature_url', 'exam_name', 'exam_schedule', 'exam_card_settings'
  ];
BEGIN
  IF NOT public._exam_panitia_ok() THEN
    RAISE EXCEPTION 'Tidak berhak mengakses pengaturan ujian' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.school_settings s
   WHERE s.school_id IS NOT DISTINCT FROM v_school
   ORDER BY s.created_at DESC NULLS LAST
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- hanya kunci yang diizinkan (kolom yang tidak ada di tabel otomatis dilewati)
  RETURN (SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
            FROM jsonb_each(to_jsonb(v_row)) e
           WHERE e.key = ANY (v_keys));
END
$$;
REVOKE ALL ON FUNCTION public.exam_settings_get() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_settings_get() TO authenticated;

-- 3. Simpan nama ujian / jadwal / pengaturan kartu (NULL = tidak diubah) ----------------
CREATE OR REPLACE FUNCTION public.exam_settings_save(
  p_exam_name text DEFAULT NULL,
  p_exam_schedule jsonb DEFAULT NULL,
  p_exam_card_settings jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_id uuid;
BEGIN
  IF NOT public._exam_panitia_ok() THEN
    RAISE EXCEPTION 'Tidak berhak mengubah pengaturan ujian' USING ERRCODE = '42501';
  END IF;
  IF p_exam_name IS NOT NULL AND (length(btrim(p_exam_name)) = 0 OR length(p_exam_name) > 200) THEN
    RAISE EXCEPTION 'Nama ujian wajib diisi (maksimal 200 karakter)' USING ERRCODE = '22023';
  END IF;
  IF p_exam_schedule IS NOT NULL AND (jsonb_typeof(p_exam_schedule) <> 'array' OR jsonb_array_length(p_exam_schedule) > 300) THEN
    RAISE EXCEPTION 'Jadwal ujian harus berupa daftar (maksimal 300 sesi)' USING ERRCODE = '22023';
  END IF;
  IF p_exam_card_settings IS NOT NULL AND jsonb_typeof(p_exam_card_settings) <> 'object' THEN
    RAISE EXCEPTION 'Pengaturan kartu ujian tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT s.id INTO v_id FROM public.school_settings s
   WHERE s.school_id IS NOT DISTINCT FROM v_school
   ORDER BY s.created_at DESC NULLS LAST
   LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Pengaturan sekolah belum dibuat. Minta admin mengisi Pengaturan Sekolah lebih dulu.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.school_settings s
     SET exam_name          = COALESCE(btrim(p_exam_name), s.exam_name),
         exam_schedule      = COALESCE(p_exam_schedule, s.exam_schedule),
         exam_card_settings = COALESCE(p_exam_card_settings, s.exam_card_settings)
   WHERE s.id = v_id;

  RETURN public.exam_settings_get();
END
$$;
REVOKE ALL ON FUNCTION public.exam_settings_save(text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_settings_save(text, jsonb, jsonb) TO authenticated;

-- 4. Data siswa/kelas/mutasi: hanya baca, satu sekolah --------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'classes', 'student_mutations'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'panitia_ujian_read_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING (public.has_role(auth.uid(), ''panitia_ujian'') AND school_id IS NOT DISTINCT FROM public.get_user_school_id())',
      'panitia_ujian_read_' || t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
