-- Akun Siswa untuk admin: tampilan se-sekolah seperti wali kelas (cakupan 1 sekolah).
--
-- Masalah sebelumnya: halaman admin mengambil profil ratusan akun lewat satu
-- permintaan `.in('id', [...])` sehingga URL terlalu panjang (ERR_FAILED) dan daftar
-- tampil kosong. Fungsi ini mengembalikan satu halaman data (siswa + kelas + akun login)
-- langsung dari server, lengkap dengan hitungan statistik, tanpa daftar ID di URL.
--
-- Aman dijalankan ulang (CREATE OR REPLACE). Tidak mengubah kebijakan RLS tabel mana pun.

CREATE OR REPLACE FUNCTION public.admin_school_students(
  p_academic_year text DEFAULT NULL,   -- NULL = semua tahun pelajaran
  p_class_id      uuid DEFAULT NULL,   -- NULL = semua kelas
  p_search        text DEFAULT NULL,   -- nama / NIS / NISN / email akun
  p_account       text DEFAULT 'all',  -- all | with | without
  p_status        text DEFAULT 'aktif',-- aktif | all
  p_limit         int  DEFAULT 25,
  p_offset        int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_super   boolean;
  v_school  uuid;
  v_q       text := lower(btrim(coalesce(p_search, '')));
  v_limit   int  := least(greatest(coalesce(p_limit, 25), 1), 1000);
  v_offset  int  := greatest(coalesce(p_offset, 0), 0);
  v_result  jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Tidak berwenang' USING ERRCODE = '42501';
  END IF;

  SELECT bool_or(ur.role::text = 'super_admin')
    INTO v_super
    FROM public.user_roles ur
   WHERE ur.user_id = v_uid;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = v_uid
       AND ur.role::text IN ('admin', 'super_admin', 'kesiswaan')
  ) THEN
    RAISE EXCEPTION 'Tidak berwenang' USING ERRCODE = '42501';
  END IF;

  -- Cakupan: sekolah milik pengguna. Super admin melihat semua sekolah.
  IF coalesce(v_super, false) THEN
    v_school := NULL;
  ELSE
    v_school := public.get_user_school_id();
  END IF;

  WITH base AS (
    SELECT
      s.id, s.nis, s.nisn, s.full_name, s.class_id, s.gender, s.birth_date, s.birth_place,
      s.address, s.parent_name, s.parent_phone, s.photo_url, s.status, s.school_id, s.rfid_uid,
      coalesce(s.is_alumni, false) AS is_alumni,
      c.name  AS class_name,
      c.grade AS class_grade,
      sa.user_id AS account_user_id,
      p.email    AS account_email,
      p.full_name AS account_name,
      (coalesce(s.status, 'aktif') = 'aktif' AND NOT coalesce(s.is_alumni, false)) AS is_active
    FROM public.students s
    LEFT JOIN public.classes c ON c.id = s.class_id
    LEFT JOIN public.student_accounts sa ON sa.student_id = s.id
    LEFT JOIN public.profiles p ON p.id = sa.user_id
    WHERE (v_school IS NULL OR s.school_id = v_school)
      AND (p_class_id IS NULL OR s.class_id = p_class_id)
      AND (p_academic_year IS NULL OR c.academic_year = p_academic_year OR s.class_id IS NULL)
  ),
  filtered AS (
    SELECT * FROM base b
    WHERE (coalesce(p_status, 'aktif') = 'all' OR b.is_active)
      AND (p_account = 'all' OR p_account IS NULL
           OR (p_account = 'with'    AND b.account_user_id IS NOT NULL)
           OR (p_account = 'without' AND b.account_user_id IS NULL))
      AND (v_q = ''
           OR position(v_q in lower(b.full_name)) > 0
           OR position(v_q in lower(b.nis)) > 0
           OR position(v_q in lower(coalesce(b.nisn, ''))) > 0
           OR position(v_q in lower(coalesce(b.account_email, ''))) > 0)
  ),
  page AS (
    SELECT * FROM filtered
    ORDER BY class_grade NULLS LAST, class_name NULLS LAST, full_name
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total',  (SELECT count(*) FROM filtered),
    'stats',  jsonb_build_object(
                'total',           (SELECT count(*) FROM base),
                'aktif',           (SELECT count(*) FROM base WHERE is_active),
                'with_account',    (SELECT count(*) FROM base WHERE account_user_id IS NOT NULL),
                'without_account', (SELECT count(*) FROM base WHERE account_user_id IS NULL AND is_active)
              ),
    'items',  coalesce((SELECT jsonb_agg(to_jsonb(pg) ORDER BY pg.class_grade NULLS LAST, pg.class_name NULLS LAST, pg.full_name) FROM page pg), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_school_students(text, uuid, text, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_school_students(text, uuid, text, text, text, int, int) TO authenticated;
