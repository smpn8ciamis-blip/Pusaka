-- Komite: RAB (Rencana Anggaran Biaya) dan Penggunaan dana (transaksi belanja + foto barang opsional).
--  * Hanya bendahara_komite sekolah itu yang boleh menambah/ubah/hapus (RLS). Admin sekolah dan super_admin hanya boleh MEMBACA.
--  * Halaman publik /website/komite membaca lewat RPC komite_anggaran_publik() (anon tidak punya akses ke tabel).
--  * Foto barang: bucket publik 'komite-penggunaan', jalur "<school_id>/<uuid>.jpg"; hanya bendahara komite yang boleh unggah/ubah/hapus.
--  * Tab RAB dan Penggunaan di halaman publik bisa disembunyikan lewat Pengaturan (kolom tampilkan_rab / tampilkan_penggunaan).
-- Aman dijalankan ulang. Tidak mengubah data yang sudah ada.

-- ============ Pengaturan tampilan publik ============
ALTER TABLE public.komite_settings
  ADD COLUMN IF NOT EXISTS tampilkan_rab boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tampilkan_penggunaan boolean NOT NULL DEFAULT true;

-- ============ Hak akses: khusus bendahara komite ============
CREATE OR REPLACE FUNCTION public._komite_bendahara(p_school uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_school IS NOT NULL
     AND p_school = public.get_user_school_id()
     AND public.has_role(auth.uid(), 'bendahara_komite');
$$;
REVOKE ALL ON FUNCTION public._komite_bendahara(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._komite_bendahara(uuid) TO authenticated;

-- ============ RAB ============
CREATE TABLE IF NOT EXISTS public.komite_rab (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kelompok     text NOT NULL CHECK (length(btrim(kelompok)) BETWEEN 1 AND 120),
  uraian       text NOT NULL CHECK (length(btrim(uraian)) BETWEEN 1 AND 300),
  volume       numeric(12,2) NOT NULL DEFAULT 1 CHECK (volume > 0 AND volume <= 1000000),
  satuan       text CHECK (satuan IS NULL OR length(satuan) <= 40),
  harga_satuan numeric(14,2) NOT NULL CHECK (harga_satuan >= 0 AND harga_satuan <= 1000000000),
  jumlah       numeric(16,2) GENERATED ALWAYS AS (round(volume * harga_satuan, 2)) STORED,
  keterangan   text CHECK (keterangan IS NULL OR length(keterangan) <= 500),
  urutan       integer NOT NULL DEFAULT 0,
  dicatat_oleh uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_komite_rab_school ON public.komite_rab (school_id, kelompok, urutan);

-- ============ Penggunaan dana (transaksi belanja) ============
CREATE TABLE IF NOT EXISTS public.komite_penggunaan (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  tanggal      date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Jakarta')::date),
  uraian       text NOT NULL CHECK (length(btrim(uraian)) BETWEEN 1 AND 300),
  rab_id       uuid REFERENCES public.komite_rab(id) ON DELETE SET NULL,
  penerima     text CHECK (penerima IS NULL OR length(penerima) <= 150),
  volume       numeric(12,2) NOT NULL DEFAULT 1 CHECK (volume > 0 AND volume <= 1000000),
  satuan       text CHECK (satuan IS NULL OR length(satuan) <= 40),
  jumlah       numeric(14,2) NOT NULL CHECK (jumlah > 0 AND jumlah <= 1000000000),
  keterangan   text CHECK (keterangan IS NULL OR length(keterangan) <= 500),
  foto_path    text CHECK (foto_path IS NULL OR foto_path LIKE school_id::text || '/%'),
  dicatat_oleh uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_komite_penggunaan_school_tgl ON public.komite_penggunaan (school_id, tanggal DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_komite_penggunaan_rab ON public.komite_penggunaan (rab_id);

ALTER TABLE public.komite_rab ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.komite_penggunaan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.komite_rab, public.komite_penggunaan FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.komite_rab, public.komite_penggunaan TO authenticated;

-- ============ Pemicu ============
-- Tidak mempercayai klien: pencatat diisi dari sesi, sekolah tidak boleh dipindah, pos RAB harus milik sekolah yang sama.
CREATE OR REPLACE FUNCTION public._komite_rab_validasi()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.dicatat_oleh := auth.uid();
  ELSIF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'Sekolah pada catatan tidak boleh diubah';
  END IF;
  NEW.kelompok := btrim(NEW.kelompok);
  NEW.uraian := btrim(NEW.uraian);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._komite_penggunaan_validasi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.dicatat_oleh := auth.uid();
  ELSIF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'Sekolah pada catatan tidak boleh diubah';
  END IF;
  NEW.uraian := btrim(NEW.uraian);
  IF NEW.rab_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.komite_rab r WHERE r.id = NEW.rab_id AND r.school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'Pos RAB tidak ditemukan pada sekolah ini';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._komite_rab_validasi() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._komite_penggunaan_validasi() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_a_komite_rab_school ON public.komite_rab;
CREATE TRIGGER trg_a_komite_rab_school BEFORE INSERT ON public.komite_rab
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
DROP TRIGGER IF EXISTS trg_b_komite_rab_validasi ON public.komite_rab;
CREATE TRIGGER trg_b_komite_rab_validasi BEFORE INSERT OR UPDATE ON public.komite_rab
  FOR EACH ROW EXECUTE FUNCTION public._komite_rab_validasi();
DROP TRIGGER IF EXISTS trg_komite_rab_touch ON public.komite_rab;
CREATE TRIGGER trg_komite_rab_touch BEFORE UPDATE ON public.komite_rab
  FOR EACH ROW EXECUTE FUNCTION public._komite_touch();

DROP TRIGGER IF EXISTS trg_a_komite_penggunaan_school ON public.komite_penggunaan;
CREATE TRIGGER trg_a_komite_penggunaan_school BEFORE INSERT ON public.komite_penggunaan
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
DROP TRIGGER IF EXISTS trg_b_komite_penggunaan_validasi ON public.komite_penggunaan;
CREATE TRIGGER trg_b_komite_penggunaan_validasi BEFORE INSERT OR UPDATE ON public.komite_penggunaan
  FOR EACH ROW EXECUTE FUNCTION public._komite_penggunaan_validasi();
DROP TRIGGER IF EXISTS trg_komite_penggunaan_touch ON public.komite_penggunaan;
CREATE TRIGGER trg_komite_penggunaan_touch BEFORE UPDATE ON public.komite_penggunaan
  FOR EACH ROW EXECUTE FUNCTION public._komite_touch();

-- ============ RLS: baca = pengelola komite; tulis = HANYA bendahara_komite ============
DROP POLICY IF EXISTS komite_rab_baca ON public.komite_rab;
CREATE POLICY komite_rab_baca ON public.komite_rab FOR SELECT TO authenticated
  USING (public._komite_can_manage(school_id));
DROP POLICY IF EXISTS komite_rab_tambah ON public.komite_rab;
CREATE POLICY komite_rab_tambah ON public.komite_rab FOR INSERT TO authenticated
  WITH CHECK (public._komite_bendahara(school_id));
DROP POLICY IF EXISTS komite_rab_ubah ON public.komite_rab;
CREATE POLICY komite_rab_ubah ON public.komite_rab FOR UPDATE TO authenticated
  USING (public._komite_bendahara(school_id)) WITH CHECK (public._komite_bendahara(school_id));
DROP POLICY IF EXISTS komite_rab_hapus ON public.komite_rab;
CREATE POLICY komite_rab_hapus ON public.komite_rab FOR DELETE TO authenticated
  USING (public._komite_bendahara(school_id));

DROP POLICY IF EXISTS komite_penggunaan_baca ON public.komite_penggunaan;
CREATE POLICY komite_penggunaan_baca ON public.komite_penggunaan FOR SELECT TO authenticated
  USING (public._komite_can_manage(school_id));
DROP POLICY IF EXISTS komite_penggunaan_tambah ON public.komite_penggunaan;
CREATE POLICY komite_penggunaan_tambah ON public.komite_penggunaan FOR INSERT TO authenticated
  WITH CHECK (public._komite_bendahara(school_id));
DROP POLICY IF EXISTS komite_penggunaan_ubah ON public.komite_penggunaan;
CREATE POLICY komite_penggunaan_ubah ON public.komite_penggunaan FOR UPDATE TO authenticated
  USING (public._komite_bendahara(school_id)) WITH CHECK (public._komite_bendahara(school_id));
DROP POLICY IF EXISTS komite_penggunaan_hapus ON public.komite_penggunaan;
CREATE POLICY komite_penggunaan_hapus ON public.komite_penggunaan FOR DELETE TO authenticated
  USING (public._komite_bendahara(school_id));

-- ============ Foto barang (opsional) ============
-- Bucket publik: foto ditampilkan di halaman publik lewat URL publik. Jalur: <school_id>/<uuid>.jpg
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('komite-penggunaan', 'komite-penggunaan', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "komite penggunaan foto tambah" ON storage.objects;
CREATE POLICY "komite penggunaan foto tambah" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'komite-penggunaan'
              AND split_part(name, '/', 1) = public.get_user_school_id()::text
              AND public.has_role(auth.uid(), 'bendahara_komite'));
DROP POLICY IF EXISTS "komite penggunaan foto baca" ON storage.objects;
CREATE POLICY "komite penggunaan foto baca" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'komite-penggunaan'
         AND split_part(name, '/', 1) = public.get_user_school_id()::text
         AND public.has_role(auth.uid(), 'bendahara_komite'));
DROP POLICY IF EXISTS "komite penggunaan foto ubah" ON storage.objects;
CREATE POLICY "komite penggunaan foto ubah" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'komite-penggunaan'
         AND split_part(name, '/', 1) = public.get_user_school_id()::text
         AND public.has_role(auth.uid(), 'bendahara_komite'))
  WITH CHECK (bucket_id = 'komite-penggunaan'
              AND split_part(name, '/', 1) = public.get_user_school_id()::text
              AND public.has_role(auth.uid(), 'bendahara_komite'));
DROP POLICY IF EXISTS "komite penggunaan foto hapus" ON storage.objects;
CREATE POLICY "komite penggunaan foto hapus" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'komite-penggunaan'
         AND split_part(name, '/', 1) = public.get_user_school_id()::text
         AND public.has_role(auth.uid(), 'bendahara_komite'));

-- ============ RPC publik ============
-- Sekolah dipilih sama seperti komite_publik() (sekolah situs; bila belum punya pengaturan komite, yang terbaru).
-- Hanya bagian yang diizinkan Pengaturan yang dikirim. 'terpakai' per pos RAB hanya terisi bila Penggunaan ditampilkan.
CREATE OR REPLACE FUNCTION public.komite_anggaran_publik()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st public.komite_settings;
  v_terkumpul numeric; v_rab jsonb := '[]'::jsonb; v_pakai jsonb := '[]'::jsonb;
  v_total_rab numeric := 0; v_total_pakai numeric := 0; v_cnt_pakai integer := 0;
BEGIN
  SELECT ks.* INTO st FROM public.komite_settings ks
  ORDER BY (ks.school_id = (SELECT ss.school_id FROM public.school_settings ss ORDER BY ss.created_at DESC LIMIT 1)) DESC NULLS LAST,
           ks.updated_at DESC
  LIMIT 1;
  IF st.school_id IS NULL THEN
    RETURN jsonb_build_object('configured', false);
  END IF;

  SELECT COALESCE(SUM(jumlah), 0) INTO v_terkumpul FROM public.komite_donasi WHERE school_id = st.school_id;

  IF st.tampilkan_penggunaan THEN
    SELECT COALESCE(SUM(jumlah), 0), COUNT(*) INTO v_total_pakai, v_cnt_pakai
      FROM public.komite_penggunaan WHERE school_id = st.school_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', p.id, 'tanggal', p.tanggal, 'uraian', p.uraian, 'rab_id', p.rab_id,
             'kelompok', r.kelompok, 'rab_uraian', r.uraian, 'penerima', p.penerima,
             'volume', p.volume, 'satuan', p.satuan, 'jumlah', p.jumlah, 'keterangan', p.keterangan,
             'foto_path', p.foto_path) ORDER BY p.tanggal DESC, p.created_at DESC), '[]'::jsonb)
      INTO v_pakai
    FROM public.komite_penggunaan p
    LEFT JOIN public.komite_rab r ON r.id = p.rab_id
    WHERE p.school_id = st.school_id;
  END IF;

  IF st.tampilkan_rab THEN
    SELECT COALESCE(SUM(jumlah), 0) INTO v_total_rab FROM public.komite_rab WHERE school_id = st.school_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', r.id, 'kelompok', r.kelompok, 'uraian', r.uraian, 'volume', r.volume, 'satuan', r.satuan,
             'harga_satuan', r.harga_satuan, 'jumlah', r.jumlah, 'keterangan', r.keterangan, 'urutan', r.urutan,
             'terpakai', CASE WHEN st.tampilkan_penggunaan
                              THEN (SELECT COALESCE(SUM(p.jumlah), 0) FROM public.komite_penggunaan p WHERE p.rab_id = r.id)
                              ELSE NULL END)
             ORDER BY r.kelompok, r.urutan, r.created_at), '[]'::jsonb)
      INTO v_rab
    FROM public.komite_rab r WHERE r.school_id = st.school_id;
  END IF;

  RETURN jsonb_build_object(
    'configured', true,
    'tampilkan_rab', st.tampilkan_rab,
    'tampilkan_penggunaan', st.tampilkan_penggunaan,
    'terkumpul', v_terkumpul,
    'target', st.target,
    'total_rab', v_total_rab,
    'total_penggunaan', v_total_pakai,
    'jumlah_penggunaan', v_cnt_pakai,
    'rab', v_rab,
    'penggunaan', v_pakai);
END;
$$;
REVOKE ALL ON FUNCTION public.komite_anggaran_publik() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.komite_anggaran_publik() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
