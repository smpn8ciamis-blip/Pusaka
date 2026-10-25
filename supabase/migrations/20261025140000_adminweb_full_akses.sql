-- ============================================================
-- Admin Web: akses penuh (lihat/tambah/ubah/hapus) ke semua fitur panel /web-admin
--
-- Sebelumnya:
--  * extracurricular_types (menu Ekstrakurikuler) hanya punya policy admin & bendahara,
--    sehingga admin_web gagal menyimpan/menghapus.
--  * Panel tidak punya unggah gambar; semua gambar harus berupa URL.
-- Perubahan (aman dijalankan ulang):
--  1. Policy "full access" peran admin_web/admin/super_admin untuk semua tabel website_*
--     (menegaskan ulang, termasuk melihat draft/nonaktif) dan GRANT ke authenticated.
--  2. Policy admin_web untuk extracurricular_types.
--  3. Bucket publik 'website-media' untuk gambar website + policy unggah/ubah/hapus
--     khusus admin_web/admin/super_admin (baca publik).
-- Dampak: tidak ada akun yang kehilangan akses. Hanya admin_web yang bertambah haknya.
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  tabel TEXT[] := ARRAY[
    'website_settings', 'website_hero_slides', 'website_pages', 'website_news_categories',
    'website_news', 'website_gallery_albums', 'website_gallery_items', 'website_agenda',
    'website_programs', 'website_contact_messages'
  ];
BEGIN
  FOREACH tbl IN ARRAY tabel LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Web admin full access" ON public.%I', tbl);
    EXECUTE format($p$CREATE POLICY "Web admin full access" ON public.%I FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))$p$, tbl);
  END LOOP;
END $$;

-- Menu Ekstrakurikuler di panel web (school_id diisi trigger auto_set_school_id saat insert)
DROP POLICY IF EXISTS "Admin web can manage extracurricular types" ON public.extracurricular_types;
CREATE POLICY "Admin web can manage extracurricular types" ON public.extracurricular_types
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_web'));

-- Penyimpanan gambar website
INSERT INTO storage.buckets (id, name, public)
VALUES ('website-media', 'website-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "website media read" ON storage.objects;
CREATE POLICY "website media read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'website-media');

DROP POLICY IF EXISTS "website media insert" ON storage.objects;
CREATE POLICY "website media insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'website-media'
    AND (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

DROP POLICY IF EXISTS "website media update" ON storage.objects;
CREATE POLICY "website media update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'website-media'
    AND (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (bucket_id = 'website-media');

DROP POLICY IF EXISTS "website media delete" ON storage.objects;
CREATE POLICY "website media delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'website-media'
    AND (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));
