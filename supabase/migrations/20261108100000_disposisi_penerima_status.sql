-- Disposisi surat masuk: penerima berupa akun (opsional) + tindak lanjut & status oleh penerima.
--  * disposisi_surat.tujuan_user_id : akun penerima (guru/staf). tujuan_disposisi tetap teks bebas.
--  * disposisi_surat.tindak_lanjut  : catatan penerima saat menindaklanjuti.
--  * disposisi_penerima()           : daftar guru & staf ber-akun satu sekolah (admin/tata usaha).
--  * disposisi_saya()               : disposisi yang ditujukan ke pengguna yang login (tanpa membuka tabel surat).
--  * disposisi_update_status()      : penerima atau admin/tata usaha mengubah status/tindak lanjut.
-- Aman dijalankan ulang.

ALTER TABLE public.disposisi_surat ADD COLUMN IF NOT EXISTS tujuan_user_id uuid;
ALTER TABLE public.disposisi_surat ADD COLUMN IF NOT EXISTS tindak_lanjut text;
CREATE INDEX IF NOT EXISTS idx_disposisi_surat_tujuan_user ON public.disposisi_surat (tujuan_user_id) WHERE tujuan_user_id IS NOT NULL;

-- Daftar calon penerima ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disposisi_penerima()
RETURNS TABLE(user_id uuid, full_name text, kind text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Tidak berhak';
  END IF;
  RETURN QUERY
    SELECT t.user_id, coalesce(p.full_name, 'Guru')::text, 'guru'::text, t.jabatan::text
      FROM public.teachers t
      LEFT JOIN public.profiles p ON p.id = t.user_id
     WHERE t.school_id IS NOT DISTINCT FROM public.get_user_school_id()
    UNION ALL
    SELECT s.user_id, s.full_name::text, 'staf'::text, s."position"::text
      FROM public.staff s
     WHERE s.user_id IS NOT NULL AND s.status = 'aktif'
       AND s.school_id IS NOT DISTINCT FROM public.get_user_school_id()
    ORDER BY 2;
END;
$$;
REVOKE ALL ON FUNCTION public.disposisi_penerima() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disposisi_penerima() TO authenticated;

-- Disposisi saya -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disposisi_saya()
RETURNS TABLE(
  id uuid, surat_masuk_id uuid, nomor_surat text, perihal text, pengirim text, tanggal_surat date,
  tanggal_diterima date, file_url text, instruksi text, catatan text, status text,
  tanggal_disposisi date, tanggal_selesai date, tindak_lanjut text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.surat_masuk_id, s.nomor_surat::text, s.perihal::text, s.pengirim::text, s.tanggal_surat,
         s.tanggal_diterima, s.file_url::text, d.instruksi::text, d.catatan::text, d.status::text,
         d.tanggal_disposisi, d.tanggal_selesai, d.tindak_lanjut::text
    FROM public.disposisi_surat d
    JOIN public.surat_masuk s ON s.id = d.surat_masuk_id
   WHERE auth.uid() IS NOT NULL AND d.tujuan_user_id = auth.uid()
   ORDER BY (d.status = 'selesai'), d.tanggal_disposisi DESC, d.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.disposisi_saya() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disposisi_saya() TO authenticated;

-- Ubah status / tindak lanjut -------------------------------------------------
CREATE OR REPLACE FUNCTION public.disposisi_update_status(p_id uuid, p_status text, p_tindak_lanjut text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.disposisi_surat%ROWTYPE;
  v_mgr boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Tidak berhak'; END IF;
  IF p_status NOT IN ('pending', 'proses', 'selesai') THEN RAISE EXCEPTION 'Status tidak valid'; END IF;
  SELECT * INTO d FROM public.disposisi_surat WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Disposisi tidak ditemukan'; END IF;

  v_mgr := (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin())
           AND (public.is_super_admin() OR d.school_id IS NOT DISTINCT FROM public.get_user_school_id());
  -- coalesce: tujuan_user_id bisa NULL; NULL pada IF NOT (...) akan meloloskan pemeriksaan
  IF NOT (coalesce(v_mgr, false) OR coalesce(d.tujuan_user_id = auth.uid(), false)) THEN RAISE EXCEPTION 'Tidak berhak'; END IF;

  UPDATE public.disposisi_surat
     SET status = p_status,
         tanggal_selesai = CASE WHEN p_status = 'selesai' THEN CURRENT_DATE ELSE NULL END,
         tindak_lanjut = coalesce(nullif(btrim(p_tindak_lanjut), ''), tindak_lanjut)
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.disposisi_update_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disposisi_update_status(uuid, text, text) TO authenticated;
