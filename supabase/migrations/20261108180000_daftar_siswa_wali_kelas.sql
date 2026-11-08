-- Cetak Daftar Siswa: nama & NIP wali kelas per kelas (untuk admin, tata usaha, guru).
-- Dibuat sebagai RPC karena tabel profiles/teachers tidak boleh dibaca bebas oleh semua peran.
-- Aman dijalankan ulang.

CREATE OR REPLACE FUNCTION public.class_homeroom_infos()
RETURNS TABLE (class_id uuid, teacher_name text, teacher_nip text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, p.full_name, t.nip
  FROM public.classes c
  JOIN public.teachers t ON t.id = c.homeroom_teacher_id
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE auth.uid() IS NOT NULL
    AND (public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'tata_usaha')
         OR public.has_role(auth.uid(), 'teacher')
         OR public.is_super_admin())
    AND (c.school_id = public.get_user_school_id() OR public.is_super_admin())
$$;

REVOKE ALL ON FUNCTION public.class_homeroom_infos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_homeroom_infos() TO authenticated;
