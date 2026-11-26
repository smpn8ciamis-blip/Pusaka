-- Surat tugas Kepala Sekolah/Plt (format Dinas Pendidikan, ditandatangani Kabid Pembinaan SMP).
-- Kepsek/Plt mendapat surat tugas terpisah dari guru; nomornya otomatis dan tersimpan di surat tugas.
-- Aman dijalankan ulang.

-- 1. Nomor surat tugas khusus kepala sekolah/Plt (surat guru tetap memakai letter_number) --------
ALTER TABLE public.assignment_letters ADD COLUMN IF NOT EXISTS kepsek_letter_number text;

ALTER TABLE public.assignment_letters DROP CONSTRAINT IF EXISTS assignment_letters_kepsek_number_len;
ALTER TABLE public.assignment_letters ADD CONSTRAINT assignment_letters_kepsek_number_len
  CHECK (kepsek_letter_number IS NULL OR char_length(btrim(kepsek_letter_number)) BETWEEN 1 AND 100);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_letters_kepsek_number
  ON public.assignment_letters (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(kepsek_letter_number)))
  WHERE kepsek_letter_number IS NOT NULL;

-- 2. Pengaturan format surat kepsek (satu kolom JSON di pengaturan sekolah) --------------------
-- Isi: pola nomor, tempat surat, tiga baris kop Dinas, pejabat penandatangan (Kabid), pangkat kepsek/Plt.
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS surat_tugas_kepsek jsonb;

CREATE OR REPLACE FUNCTION public._stk_can_use()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin())
$$;
REVOKE ALL ON FUNCTION public._stk_can_use() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._stk_can_use() TO authenticated;

CREATE OR REPLACE FUNCTION public.surat_tugas_kepsek_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
BEGIN
  IF NOT public._stk_can_use() THEN RAISE EXCEPTION 'Tidak berhak'; END IF;
  SELECT ss.surat_tugas_kepsek INTO r FROM public.school_settings ss WHERE ss.id = public._mm_settings_id();
  RETURN coalesce(r, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.surat_tugas_kepsek_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surat_tugas_kepsek_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.surat_tugas_kepsek_save_settings(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := public._mm_settings_id();
  v_out jsonb := '{}'::jsonb;
  k text;
  v text;
BEGIN
  IF NOT public._stk_can_use() THEN RAISE EXCEPTION 'Tidak berhak'; END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Pengaturan sekolah belum dibuat'; END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'Data pengaturan tidak valid'; END IF;

  -- hanya kunci yang dikenal; semuanya teks pendek
  FOREACH k IN ARRAY ARRAY['pattern','tempat','kop1','kop2','kop3','penerbit_nama','penerbit_nip','penerbit_pangkat','penerbit_jabatan','kepsek_pangkat'] LOOP
    v := btrim(coalesce(p ->> k, ''));
    IF char_length(v) > 200 THEN RAISE EXCEPTION 'Isian % terlalu panjang (maksimal 200 karakter)', k; END IF;
    v_out := v_out || jsonb_build_object(k, v);
  END LOOP;

  v := v_out ->> 'pattern';
  IF v <> '' THEN
    IF char_length(v) > 80 THEN RAISE EXCEPTION 'Pola nomor maksimal 80 karakter'; END IF;
    IF (SELECT count(*) FROM regexp_matches(v, '\{URUT(?::[0-9]{1,2})?\}', 'g')) <> 1 THEN
      RAISE EXCEPTION 'Pola nomor harus memuat tepat satu {URUT} atau {URUT:n}';
    END IF;
    IF regexp_replace(v, '\{(TAHUN|YY|BULAN|ROMAWI|URUT(:[0-9]{1,2})?)\}', '', 'g') ~ '[{}]' THEN
      RAISE EXCEPTION 'Pola nomor memuat token yang tidak dikenal';
    END IF;
  END IF;

  UPDATE public.school_settings SET surat_tugas_kepsek = v_out WHERE id = v_id;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.surat_tugas_kepsek_save_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surat_tugas_kepsek_save_settings(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
