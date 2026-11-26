-- Paket SPPD Kepala Sekolah/Plt lengkap (Surat Tugas Dinas, SPD depan, SPD belakang, LPT).
-- Menyimpan data Kabid Pembinaan SMP di database (kolom JSON school_settings.surat_tugas_kepsek,
-- dibuat oleh 20261126100000_surat_tugas_kepsek.sql — jalankan itu lebih dulu).
-- Aman dijalankan ulang; isian Kabid yang sudah diisi pengguna TIDAK ditimpa.

-- 1. Isi awal data Kabid (dari berkas contoh SPPD) hanya bila masih kosong ----------------------
UPDATE public.school_settings ss
SET surat_tugas_kepsek = coalesce(ss.surat_tugas_kepsek, '{}'::jsonb) || (
  SELECT coalesce(jsonb_object_agg(d.k, d.v), '{}'::jsonb)
  FROM (VALUES
    ('penerbit_nama',    'ARIS GUNANTO, M.Pd., Si'),
    ('penerbit_nip',     '197604112000031001'),
    ('penerbit_pangkat', 'Pembina Tk.1, IV/b'),
    ('penerbit_jabatan', 'Kepala Bidang Pembinaan SMP'),
    ('spd_alat_angkut',  'Kendaraan Umum'),
    ('spd_tingkat_biaya','BOS')
  ) AS d(k, v)
  WHERE btrim(coalesce(ss.surat_tugas_kepsek ->> d.k, '')) = ''
);

-- 2. Yang boleh MEMBACA data (untuk mencetak SPD): admin, tata usaha, bendahara, super admin ------
CREATE OR REPLACE FUNCTION public._stk_can_read()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tata_usaha')
    OR public.has_role(auth.uid(), 'bendahara') OR public.is_super_admin())
$$;
REVOKE ALL ON FUNCTION public._stk_can_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._stk_can_read() TO authenticated;

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
  IF NOT public._stk_can_read() THEN RAISE EXCEPTION 'Tidak berhak'; END IF;
  SELECT ss.surat_tugas_kepsek INTO r FROM public.school_settings ss WHERE ss.id = public._mm_settings_id();
  RETURN coalesce(r, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.surat_tugas_kepsek_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surat_tugas_kepsek_settings() TO authenticated;

-- 3. Simpan pengaturan: menambah dua isian SPD (alat angkut dan tingkat biaya bawaan) -------------
-- Menyimpan tetap hanya untuk admin, tata usaha, super admin.
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

  FOREACH k IN ARRAY ARRAY['pattern','tempat','kop1','kop2','kop3','penerbit_nama','penerbit_nip','penerbit_pangkat','penerbit_jabatan','kepsek_pangkat','spd_alat_angkut','spd_tingkat_biaya'] LOOP
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
