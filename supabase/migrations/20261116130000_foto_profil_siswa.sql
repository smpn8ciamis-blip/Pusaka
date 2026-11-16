-- Siswa boleh mengunggah foto profilnya sendiri (diatur lewat saklar di Pengaturan admin).
--   1. school_settings.allow_student_photo_upload : saklar, default TRUE (siswa boleh).
--   2. student_photo_upload_enabled()             : membaca saklar (pengaturan terbaru).
--   3. student_set_own_photo(p_url)               : siswa mengganti/menghapus foto pada baris siswanya sendiri.
--   4. Kebijakan storage RESTRICTIVE              : akun siswa hanya boleh menulis ke
--                                                    student-photos/siswa/<uid>/... dan hanya bila saklar menyala.
--      Peran lain (admin, guru, dsb.) tidak berubah; kebijakan lama di bucket tetap berlaku untuk mereka.
-- Aman dijalankan ulang.

ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS allow_student_photo_upload boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.student_photo_upload_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT allow_student_photo_upload FROM public.school_settings ORDER BY created_at DESC LIMIT 1),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.student_set_own_photo(p_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sid uuid;
  v_url text := NULLIF(btrim(COALESCE(p_url, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'siswa') THEN
    RAISE EXCEPTION 'Hanya akun siswa yang dapat mengganti foto profil' USING ERRCODE = '42501';
  END IF;
  IF NOT public.student_photo_upload_enabled() THEN
    RAISE EXCEPTION 'Unggah foto profil oleh siswa sedang dinonaktifkan oleh admin' USING ERRCODE = '42501';
  END IF;
  SELECT student_id INTO v_sid FROM public.student_accounts WHERE user_id = auth.uid();
  IF v_sid IS NULL THEN
    RAISE EXCEPTION 'Akun siswa belum tertaut ke data siswa' USING ERRCODE = 'P0002';
  END IF;
  -- Hanya berkas milik siswa itu sendiri yang boleh dipasang (mencegah menunjuk foto orang lain).
  IF v_url IS NOT NULL
     AND position('/student-photos/siswa/' || auth.uid()::text || '/' IN split_part(v_url, '?', 1)) = 0 THEN
    RAISE EXCEPTION 'Alamat foto tidak valid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.students SET photo_url = v_url WHERE id = v_sid;
  RETURN jsonb_build_object('ok', true, 'photo_url', v_url);
END;
$$;

REVOKE ALL ON FUNCTION public.student_photo_upload_enabled() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_set_own_photo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_photo_upload_enabled() TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_set_own_photo(text) TO authenticated;

-- Kebijakan RESTRICTIVE: dipadukan (AND) dengan kebijakan lama yang mengizinkan semua pengguna login.
-- Untuk bucket lain dan untuk non-siswa, kondisi selalu benar sehingga tidak ada efek.
DROP POLICY IF EXISTS "Siswa hanya unggah foto sendiri (insert)" ON storage.objects;
CREATE POLICY "Siswa hanya unggah foto sendiri (insert)" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'student-photos'
    OR NOT public.has_role(auth.uid(), 'siswa')
    OR (name LIKE 'siswa/' || auth.uid()::text || '/%' AND public.student_photo_upload_enabled())
  );

DROP POLICY IF EXISTS "Siswa hanya ubah foto sendiri (update)" ON storage.objects;
CREATE POLICY "Siswa hanya ubah foto sendiri (update)" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    bucket_id <> 'student-photos'
    OR NOT public.has_role(auth.uid(), 'siswa')
    OR (name LIKE 'siswa/' || auth.uid()::text || '/%' AND public.student_photo_upload_enabled())
  )
  WITH CHECK (
    bucket_id <> 'student-photos'
    OR NOT public.has_role(auth.uid(), 'siswa')
    OR (name LIKE 'siswa/' || auth.uid()::text || '/%' AND public.student_photo_upload_enabled())
  );

DROP POLICY IF EXISTS "Siswa hanya hapus foto sendiri (delete)" ON storage.objects;
CREATE POLICY "Siswa hanya hapus foto sendiri (delete)" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id <> 'student-photos'
    OR NOT public.has_role(auth.uid(), 'siswa')
    OR (name LIKE 'siswa/' || auth.uid()::text || '/%' AND public.student_photo_upload_enabled())
  );

NOTIFY pgrst, 'reload schema';
