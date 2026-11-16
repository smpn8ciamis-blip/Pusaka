-- Lanjutan 20261116130000_foto_profil_siswa.sql: opsi "siswa hanya boleh unggah foto 1 kali".
--   * school_settings.student_photo_upload_once : saklar (default MATI = siswa boleh ganti kapan saja).
--   * student_accounts.photo_uploaded_at        : kapan siswa terakhir memasang foto (diisi RPC).
--   * Bila saklar menyala dan siswa sudah pernah mengunggah: RPC dan storage menolak unggah/ubah/hapus
--     dari akun siswa. Siswa diminta menghubungi admin.
--   * admin_reset_student_photo_upload(student_id)  : admin/kesiswaan membuka kunci satu siswa agar bisa unggah lagi.
--   * Kebijakan storage disederhanakan lewat fungsi student_photo_write_allowed(name);
--     akun siswa kini hanya boleh menulis tepat ke  siswa/<uid>/foto.jpg  (bukan nama berkas bebas).
-- Jalankan SETELAH 20261116130000_foto_profil_siswa.sql. Aman dijalankan ulang.

ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS student_photo_upload_once boolean NOT NULL DEFAULT false;
ALTER TABLE public.student_accounts
  ADD COLUMN IF NOT EXISTS photo_uploaded_at timestamptz;

CREATE OR REPLACE FUNCTION public.student_photo_upload_once()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT student_photo_upload_once FROM public.school_settings ORDER BY created_at DESC LIMIT 1), false);
$$;

-- Status untuk tampilan siswa: boleh unggah? mode sekali? sudah pernah?
CREATE OR REPLACE FUNCTION public.student_photo_upload_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_enabled boolean := public.student_photo_upload_enabled();
  v_once boolean := public.student_photo_upload_once();
  v_uploaded boolean := false;
BEGIN
  SELECT (photo_uploaded_at IS NOT NULL) INTO v_uploaded FROM public.student_accounts WHERE user_id = auth.uid();
  v_uploaded := COALESCE(v_uploaded, false);
  RETURN jsonb_build_object('enabled', v_enabled, 'once', v_once, 'uploaded', v_uploaded,
                            'can_upload', v_enabled AND NOT (v_once AND v_uploaded));
END;
$$;

-- Dipakai kebijakan storage: boleh tidaknya pengguna sekarang menulis objek bernama p_name di bucket student-photos.
CREATE OR REPLACE FUNCTION public.student_photo_write_allowed(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uploaded boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF NOT public.has_role(v_uid, 'siswa') THEN RETURN true; END IF;   -- peran lain: tidak dibatasi di sini
  IF p_name IS DISTINCT FROM ('siswa/' || v_uid::text || '/foto.jpg') THEN RETURN false; END IF;
  IF NOT public.student_photo_upload_enabled() THEN RETURN false; END IF;
  IF public.student_photo_upload_once() THEN
    SELECT (photo_uploaded_at IS NOT NULL) INTO v_uploaded FROM public.student_accounts WHERE user_id = v_uid;
    IF COALESCE(v_uploaded, false) THEN RETURN false; END IF;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_set_own_photo(p_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc public.student_accounts;
  v_url text := NULLIF(btrim(COALESCE(p_url, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'siswa') THEN
    RAISE EXCEPTION 'Hanya akun siswa yang dapat mengganti foto profil' USING ERRCODE = '42501';
  END IF;
  IF NOT public.student_photo_upload_enabled() THEN
    RAISE EXCEPTION 'Unggah foto profil oleh siswa sedang dinonaktifkan oleh admin' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_acc FROM public.student_accounts WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun siswa belum tertaut ke data siswa' USING ERRCODE = 'P0002';
  END IF;
  IF public.student_photo_upload_once() AND v_acc.photo_uploaded_at IS NOT NULL THEN
    RAISE EXCEPTION 'Foto profil hanya dapat diunggah 1 kali. Hubungi admin untuk mengubah foto.' USING ERRCODE = '42501';
  END IF;
  IF v_url IS NOT NULL
     AND position('/student-photos/siswa/' || auth.uid()::text || '/foto.jpg' IN split_part(v_url, '?', 1)) = 0 THEN
    RAISE EXCEPTION 'Alamat foto tidak valid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.students SET photo_url = v_url WHERE id = v_acc.student_id;
  IF v_url IS NOT NULL THEN
    UPDATE public.student_accounts SET photo_uploaded_at = now() WHERE id = v_acc.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'photo_url', v_url);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_student_photo_upload(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan')) THEN
    RAISE EXCEPTION 'Tidak memiliki akses' USING ERRCODE = '42501';
  END IF;
  UPDATE public.student_accounts
     SET photo_uploaded_at = NULL
   WHERE student_id = p_student_id
     AND (public.is_super_admin() OR school_id = public.get_user_school_id());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Akun siswa tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.student_photo_upload_once() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_photo_upload_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_photo_write_allowed(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_set_own_photo(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reset_student_photo_upload(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_photo_upload_once() TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_photo_upload_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_photo_write_allowed(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_set_own_photo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_student_photo_upload(uuid) TO authenticated;

DROP POLICY IF EXISTS "Siswa hanya unggah foto sendiri (insert)" ON storage.objects;
CREATE POLICY "Siswa hanya unggah foto sendiri (insert)" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'student-photos' OR public.student_photo_write_allowed(name));

DROP POLICY IF EXISTS "Siswa hanya ubah foto sendiri (update)" ON storage.objects;
CREATE POLICY "Siswa hanya ubah foto sendiri (update)" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'student-photos' OR public.student_photo_write_allowed(name))
  WITH CHECK (bucket_id <> 'student-photos' OR public.student_photo_write_allowed(name));

DROP POLICY IF EXISTS "Siswa hanya hapus foto sendiri (delete)" ON storage.objects;
CREATE POLICY "Siswa hanya hapus foto sendiri (delete)" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'student-photos' OR public.student_photo_write_allowed(name));

NOTIFY pgrst, 'reload schema';
