-- Perketat RLS: sebelumnya SEMUA akun login (termasuk siswa) bisa mengubah/menghapus
-- buku tamu dan mengubah pengaturan pengumuman kelulusan.

-- Buku tamu: hanya admin dan guru piket di sekolahnya (sesuai akses menu /buku-tamu).
DROP POLICY IF EXISTS "Authenticated users can view guest book" ON public.guest_book;
DROP POLICY IF EXISTS "Authenticated users can insert guest book" ON public.guest_book;
DROP POLICY IF EXISTS "Authenticated users can update guest book" ON public.guest_book;
DROP POLICY IF EXISTS "Authenticated users can delete guest book" ON public.guest_book;

CREATE POLICY "Guest book staff select" ON public.guest_book FOR SELECT TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'guru_piket') OR public.is_super_admin())
         AND (school_id = public.get_user_school_id() OR public.is_super_admin()));
CREATE POLICY "Guest book staff insert" ON public.guest_book FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'guru_piket') OR public.is_super_admin());
CREATE POLICY "Guest book staff update" ON public.guest_book FOR UPDATE TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'guru_piket') OR public.is_super_admin())
         AND (school_id = public.get_user_school_id() OR public.is_super_admin()));
CREATE POLICY "Guest book staff delete" ON public.guest_book FOR DELETE TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'guru_piket') OR public.is_super_admin())
         AND (school_id = public.get_user_school_id() OR public.is_super_admin()));

-- Pengaturan kelulusan: baca tetap publik (dipakai halaman cek kelulusan), ubah hanya admin sekolahnya.
DROP POLICY IF EXISTS "Authenticated users can insert graduation settings" ON public.graduation_announcement_settings;
DROP POLICY IF EXISTS "Authenticated users can update graduation settings" ON public.graduation_announcement_settings;

CREATE POLICY "Graduation settings admin insert" ON public.graduation_announcement_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE POLICY "Graduation settings admin update" ON public.graduation_announcement_settings FOR UPDATE TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') AND school_id = public.get_user_school_id()) OR public.is_super_admin());
