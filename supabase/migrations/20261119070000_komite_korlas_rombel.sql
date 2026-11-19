-- Korlas per ROMBEL (kelas), bukan per tingkat.
-- Sebelumnya: akun korlas dipetakan ke tingkat 7/8/9 (komite_korlas.grade, atau dari email korlasN@).
-- Sekarang: setiap rombel (mis. 7A, 7B, 8C) punya akun korlas sendiri; korlas hanya bisa
-- MEMBACA daftar siswa dan MENGINPUT sumbangan untuk siswa di rombelnya sendiri.
--
-- Dampak: akun korlas yang sudah dibuat TIDAK punya rombel sampai ditetapkan bendahara komite di
-- Dashboard Komite -> tab Korlas (sebelum itu dashboard korlas menampilkan "rombel belum ditetapkan").
-- Penetapan tingkat lama (komite_korlas.grade) dibuang; pembacaan tingkat dari email dihapus.
-- Catatan pendapatan yang sudah ada tetap utuh dan diberi rombel dari data siswanya.
-- PRASYARAT: 20261118150000_komite_peran.sql dan 20261118150100_komite_dana.sql. Aman dijalankan ulang.

-- ============ Bongkar bagian lama yang bergantung pada tingkat ============
DROP POLICY IF EXISTS komite_donasi_korlas_baca ON public.komite_donasi;
DROP FUNCTION IF EXISTS public.komite_korlas_list();
DROP FUNCTION IF EXISTS public.komite_set_korlas(uuid, integer);
DROP FUNCTION IF EXISTS public.komite_students(integer);
DROP FUNCTION IF EXISTS public.komite_my_grade();

-- ============ Tabel ============
ALTER TABLE public.komite_korlas ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE;
DELETE FROM public.komite_korlas WHERE class_id IS NULL;           -- penetapan tingkat lama tidak berlaku lagi
ALTER TABLE public.komite_korlas ALTER COLUMN class_id SET NOT NULL;
ALTER TABLE public.komite_korlas DROP COLUMN IF EXISTS grade;
CREATE INDEX IF NOT EXISTS idx_komite_korlas_class ON public.komite_korlas (class_id);

-- Rombel & nama rombel disalin ke catatan (tetap benar walau siswa kelak pindah/naik kelas)
ALTER TABLE public.komite_donasi ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.komite_donasi ADD COLUMN IF NOT EXISTS kelas_nama text;
UPDATE public.komite_donasi d
   SET class_id = s.class_id, kelas_nama = c.name
  FROM public.students s JOIN public.classes c ON c.id = s.class_id
 WHERE d.student_id = s.id AND d.kategori = 'siswa' AND d.class_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_komite_donasi_class ON public.komite_donasi (class_id);

-- ============ Trigger validasi: kini juga mengisi rombel ============
CREATE OR REPLACE FUNCTION public._komite_donasi_validasi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text; v_grade integer; v_school uuid; v_class uuid; v_kelas text; v_found boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.dicatat_oleh := COALESCE(NEW.dicatat_oleh, auth.uid());
  END IF;

  IF NEW.kategori = 'siswa' THEN
    IF NEW.student_id IS NULL AND TG_OP = 'UPDATE' AND OLD.kategori = 'siswa' THEN
      -- siswa dihapus dari data induk (FK ON DELETE SET NULL memicu UPDATE ini): pertahankan nama, tingkat, rombel lama
      NEW.grade := OLD.grade; NEW.nama := OLD.nama; NEW.class_id := OLD.class_id; NEW.kelas_nama := OLD.kelas_nama;
    ELSIF TG_OP = 'INSERT' OR NEW.student_id IS DISTINCT FROM OLD.student_id OR OLD.kategori <> 'siswa' THEN
      IF NEW.student_id IS NULL THEN
        RAISE EXCEPTION 'Pilih siswa penyumbang' USING ERRCODE = '22023';
      END IF;
      SELECT s.full_name, c.grade, s.school_id, c.id, c.name, true
        INTO v_name, v_grade, v_school, v_class, v_kelas, v_found
      FROM public.students s LEFT JOIN public.classes c ON c.id = s.class_id
      WHERE s.id = NEW.student_id;
      IF v_found IS NOT TRUE THEN
        RAISE EXCEPTION 'Siswa tidak ditemukan' USING ERRCODE = '22023';
      END IF;
      IF v_school IS DISTINCT FROM NEW.school_id THEN
        RAISE EXCEPTION 'Siswa bukan dari sekolah ini' USING ERRCODE = '42501';
      END IF;
      IF v_grade IS NULL OR v_grade NOT IN (7, 8, 9) THEN
        RAISE EXCEPTION 'Siswa belum memiliki kelas tingkat 7/8/9' USING ERRCODE = '22023';
      END IF;
      NEW.grade := v_grade;
      NEW.nama := v_name;
      NEW.class_id := v_class;
      NEW.kelas_nama := v_kelas;
    ELSE
      -- siswa sama: rombel & tingkat dari catatan tidak diubah klien
      NEW.grade := OLD.grade; NEW.class_id := OLD.class_id; NEW.kelas_nama := OLD.kelas_nama;
    END IF;
  ELSE
    NEW.grade := NULL;
    NEW.student_id := NULL;
    NEW.class_id := NULL;
    NEW.kelas_nama := NULL;
    IF btrim(COALESCE(NEW.nama, '')) = '' THEN
      RAISE EXCEPTION 'Nama donatur wajib diisi' USING ERRCODE = '22023';
    END IF;
    NEW.nama := btrim(NEW.nama);
  END IF;

  IF NEW.sumber = 'tunai' THEN
    NEW.rekening_id := NULL;
  ELSIF NEW.rekening_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.komite_rekening r WHERE r.id = NEW.rekening_id AND r.school_id = NEW.school_id) THEN
      RAISE EXCEPTION 'Rekening tidak valid' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._komite_donasi_validasi() FROM PUBLIC, anon, authenticated;

-- ============ Fungsi bantu korlas ============
-- Rombel milik korlas yang sedang login (NULL bila bukan korlas / belum ditetapkan).
CREATE OR REPLACE FUNCTION public.komite_my_class()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.class_id
  FROM public.komite_korlas k
  JOIN public.classes c ON c.id = k.class_id
  WHERE k.user_id = auth.uid()
    AND public.has_role(auth.uid(), 'korlas')
    AND k.school_id = public.get_user_school_id();
$$;
REVOKE ALL ON FUNCTION public.komite_my_class() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_my_class() TO authenticated;

-- Rombel milik korlas (untuk judul dashboard).
CREATE OR REPLACE FUNCTION public.komite_my_kelas()
RETURNS TABLE (class_id uuid, kelas text, grade integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.grade
  FROM public.classes c WHERE c.id = public.komite_my_class();
$$;
REVOKE ALL ON FUNCTION public.komite_my_kelas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_my_kelas() TO authenticated;

-- ============ RLS: korlas hanya MEMBACA catatan rombelnya ============
CREATE POLICY komite_donasi_korlas_baca ON public.komite_donasi FOR SELECT TO authenticated
  USING (kategori = 'siswa'
         AND school_id = public.get_user_school_id()
         AND public.has_role(auth.uid(), 'korlas')
         AND class_id IS NOT NULL
         AND class_id = public.komite_my_class());

-- ============ RPC ============
-- Siswa aktif untuk dipilih. Korlas: HANYA rombelnya (p_grade diabaikan). Pengelola: semua (atau p_grade).
CREATE OR REPLACE FUNCTION public.komite_students(p_grade integer DEFAULT NULL)
RETURNS TABLE (student_id uuid, nis text, nama text, kelas text, grade integer, total numeric, jumlah_kali integer, class_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_grade integer := p_grade;
  v_class uuid := NULL;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Akun ini belum terhubung ke sekolah' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(auth.uid(), 'korlas') THEN
    v_class := public.komite_my_class();
    IF v_class IS NULL THEN
      RAISE EXCEPTION 'Rombel akun korlas ini belum ditetapkan' USING ERRCODE = '42501';
    END IF;
    v_grade := NULL;
  ELSIF NOT public._komite_can_manage(v_school) THEN
    RAISE EXCEPTION 'Tidak berwenang' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id, s.nis, s.full_name, c.name, c.grade,
         COALESCE(SUM(d.jumlah), 0)::numeric, COUNT(d.id)::integer, c.id
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.komite_donasi d ON d.student_id = s.id AND d.school_id = v_school
  WHERE s.school_id = v_school
    AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
    AND c.grade IN (7, 8, 9)
    AND (v_class IS NULL OR c.id = v_class)
    AND (v_grade IS NULL OR c.grade = v_grade)
  GROUP BY s.id, s.nis, s.full_name, c.name, c.grade, c.id
  ORDER BY c.name, s.full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.komite_students(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_students(integer) TO authenticated;

-- Input sumbangan siswa oleh korlas (atau pengelola). Korlas ditolak untuk siswa di luar rombelnya.
CREATE OR REPLACE FUNCTION public.komite_input_donasi(
  p_student_id uuid, p_jumlah numeric, p_sumber text,
  p_tanggal date DEFAULT NULL, p_keterangan text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_my uuid; v_sclass uuid; v_kelas text; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_school IS NULL THEN
    RAISE EXCEPTION 'Akun ini belum terhubung ke sekolah' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(auth.uid(), 'korlas') THEN
    v_my := public.komite_my_class();
    IF v_my IS NULL THEN
      RAISE EXCEPTION 'Rombel akun korlas ini belum ditetapkan' USING ERRCODE = '42501';
    END IF;
    SELECT s.class_id INTO v_sclass FROM public.students s WHERE s.id = p_student_id AND s.school_id = v_school;
    IF v_sclass IS DISTINCT FROM v_my THEN
      SELECT c.name INTO v_kelas FROM public.classes c WHERE c.id = v_my;
      RAISE EXCEPTION 'Siswa ini bukan dari rombel %', v_kelas USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public._komite_can_manage(v_school) THEN
    RAISE EXCEPTION 'Tidak berwenang' USING ERRCODE = '42501';
  END IF;

  IF p_jumlah IS NULL OR p_jumlah <= 0 THEN
    RAISE EXCEPTION 'Jumlah harus lebih dari 0' USING ERRCODE = '22023';
  END IF;
  IF p_sumber NOT IN ('rekening', 'tunai') THEN
    RAISE EXCEPTION 'Sumber harus rekening atau tunai' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.komite_donasi (school_id, tanggal, jumlah, sumber, kategori, student_id, nama, keterangan, dicatat_oleh)
  VALUES (v_school, COALESCE(p_tanggal, (now() AT TIME ZONE 'Asia/Jakarta')::date), p_jumlah, p_sumber,
          'siswa', p_student_id, '-', NULLIF(btrim(COALESCE(p_keterangan, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.komite_input_donasi(uuid, numeric, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_input_donasi(uuid, numeric, text, date, text) TO authenticated;

-- Akun korlas di sekolah + rombelnya (untuk tab "Korlas" bendahara komite).
CREATE OR REPLACE FUNCTION public.komite_korlas_list()
RETURNS TABLE (user_id uuid, email text, nama text, class_id uuid, kelas text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_school uuid := public.get_user_school_id();
BEGIN
  IF v_school IS NULL OR NOT public._komite_can_manage(v_school) THEN
    RAISE EXCEPTION 'Tidak berwenang' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, u.email::text,
         COALESCE(p.full_name, u.raw_user_meta_data ->> 'full_name', u.email)::text,
         k.class_id, c.name
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.komite_korlas k ON k.user_id = ur.user_id
  LEFT JOIN public.classes c ON c.id = k.class_id
  WHERE ur.role = 'korlas' AND ur.school_id = v_school
  ORDER BY c.name NULLS LAST, u.email;
END;
$$;
REVOKE ALL ON FUNCTION public.komite_korlas_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_korlas_list() TO authenticated;

-- Rombel yang bisa ditetapkan ke korlas (kelas 7/8/9 yang punya siswa aktif) + jumlah siswa + akun korlas-nya.
CREATE OR REPLACE FUNCTION public.komite_kelas_list()
RETURNS TABLE (class_id uuid, kelas text, grade integer, siswa_total integer, korlas_email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_school uuid := public.get_user_school_id();
BEGIN
  IF v_school IS NULL OR NOT public._komite_can_manage(v_school) THEN
    RAISE EXCEPTION 'Tidak berwenang' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.grade, COUNT(s.id)::integer,
         (SELECT string_agg(u.email::text, ', ' ORDER BY u.email)
            FROM public.komite_korlas k JOIN auth.users u ON u.id = k.user_id
            JOIN public.user_roles ur ON ur.user_id = k.user_id AND ur.role = 'korlas'
           WHERE k.class_id = c.id)
  FROM public.classes c
  JOIN public.students s ON s.class_id = c.id AND s.school_id = v_school
       AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
  WHERE c.school_id = v_school AND c.grade IN (7, 8, 9)
  GROUP BY c.id, c.name, c.grade
  ORDER BY c.grade, c.name;
END;
$$;
REVOKE ALL ON FUNCTION public.komite_kelas_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_kelas_list() TO authenticated;

-- Tetapkan rombel korlas (p_class NULL = lepaskan).
CREATE OR REPLACE FUNCTION public.komite_set_korlas(p_user uuid, p_class uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_school uuid := public.get_user_school_id();
BEGIN
  IF v_school IS NULL OR NOT public._komite_can_manage(v_school) THEN
    RAISE EXCEPTION 'Tidak berwenang' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user AND ur.role = 'korlas' AND ur.school_id = v_school) THEN
    RAISE EXCEPTION 'Akun korlas tidak ditemukan di sekolah ini' USING ERRCODE = '22023';
  END IF;
  IF p_class IS NULL THEN
    DELETE FROM public.komite_korlas WHERE user_id = p_user;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class AND c.school_id = v_school AND c.grade IN (7, 8, 9)) THEN
      RAISE EXCEPTION 'Rombel tidak valid (harus kelas 7/8/9 di sekolah ini)' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.komite_korlas (user_id, school_id, class_id) VALUES (p_user, v_school, p_class)
    ON CONFLICT (user_id) DO UPDATE SET class_id = EXCLUDED.class_id, school_id = EXCLUDED.school_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.komite_set_korlas(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_set_korlas(uuid, uuid) TO authenticated;

-- Ringkasan per rombel. Pengelola: semua rombel; korlas: hanya rombelnya sendiri.
CREATE OR REPLACE FUNCTION public.komite_per_kelas()
RETURNS TABLE (class_id uuid, kelas text, grade integer, siswa_total integer, siswa_penyumbang integer,
               jumlah integer, total numeric, rekening numeric, tunai numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_class uuid := NULL;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Akun ini belum terhubung ke sekolah' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(auth.uid(), 'korlas') THEN
    v_class := public.komite_my_class();
    IF v_class IS NULL THEN
      RAISE EXCEPTION 'Rombel akun korlas ini belum ditetapkan' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public._komite_can_manage(v_school) THEN
    RAISE EXCEPTION 'Tidak berwenang' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.grade,
         sc.n::integer,
         COALESCE(dd.donors, 0)::integer, COALESCE(dd.cnt, 0)::integer,
         COALESCE(dd.total, 0)::numeric, COALESCE(dd.rek, 0)::numeric, COALESCE(dd.tun, 0)::numeric
  FROM public.classes c
  JOIN (SELECT s.class_id AS cid, COUNT(*) AS n
          FROM public.students s
         WHERE s.school_id = v_school AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
         GROUP BY s.class_id) sc ON sc.cid = c.id
  LEFT JOIN (SELECT d.class_id AS cid, SUM(d.jumlah) AS total, COUNT(*) AS cnt,
                    SUM(d.jumlah) FILTER (WHERE d.sumber = 'rekening') AS rek,
                    SUM(d.jumlah) FILTER (WHERE d.sumber = 'tunai') AS tun,
                    COUNT(DISTINCT d.student_id) AS donors
               FROM public.komite_donasi d
              WHERE d.school_id = v_school AND d.kategori = 'siswa' AND d.class_id IS NOT NULL
              GROUP BY d.class_id) dd ON dd.cid = c.id
  WHERE c.school_id = v_school AND c.grade IN (7, 8, 9)
    AND (v_class IS NULL OR c.id = v_class)
  ORDER BY c.grade, c.name;
END;
$$;
REVOKE ALL ON FUNCTION public.komite_per_kelas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_per_kelas() TO authenticated;

NOTIFY pgrst, 'reload schema';
