-- Username (email login) siswa untuk kartu peserta ujian. Jalankan SETELAH 20261119190100_panitia_ujian_akses.sql. Aman dijalankan ulang.
--
-- Halaman Administrasi Ujian dipakai admin dan panitia_ujian. Panitia tidak boleh membaca tabel profiles /
-- student_accounts secara langsung, jadi username siswa diberikan lewat fungsi SECURITY DEFINER ini:
--   * hanya peran panitia_ujian / admin / super_admin (pemeriksa _exam_panitia_ok),
--   * hanya siswa di sekolah pemanggil (super_admin: semua sekolah),
--   * hanya student_id dan username (email login). Password TIDAK pernah dikembalikan.

CREATE OR REPLACE FUNCTION public.exam_student_usernames()
RETURNS TABLE (student_id uuid, username text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_super boolean := public.is_super_admin();
BEGIN
  IF NOT public._exam_panitia_ok() THEN
    RAISE EXCEPTION 'Tidak berhak mengakses data akun siswa' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT sa.student_id, p.email::text
      FROM public.student_accounts sa
      JOIN public.students s ON s.id = sa.student_id
      JOIN public.profiles p ON p.id = sa.user_id
     WHERE p.email IS NOT NULL
       AND (v_super OR s.school_id IS NOT DISTINCT FROM v_school)
     ORDER BY sa.student_id;
END
$$;
REVOKE ALL ON FUNCTION public.exam_student_usernames() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_student_usernames() TO authenticated;
