-- Penggalangan dana Komite (halaman publik /website/komite + dashboard bendahara komite & korlas).
-- PRASYARAT: 20261118150000_komite_peran.sql sudah dijalankan (enum bendahara_komite & korlas).
-- Aman dijalankan ulang.
--
--   komite_settings  : judul, target, batas waktu, cara menampilkan nama di halaman publik (1 baris per sekolah)
--   komite_rekening  : rekening komite yang tampil di halaman publik
--   komite_korlas    : (opsional) penetapan tingkat kelas untuk akun korlas; bila kosong tingkat dibaca dari
--                      email korlasN@... (korlas7@ -> kelas 7)
--   komite_donasi    : catatan pendapatan (sumbangan siswa per tingkat kelas + donatur lainnya)
--
-- Akses:
--   * bendahara_komite (dan admin sekolah / super_admin): CRUD penuh semua tabel di atas.
--   * korlas: TIDAK bisa menulis tabel langsung. Menginput hanya lewat komite_input_donasi() yang menolak
--     siswa di luar tingkat kelasnya; hanya bisa MEMBACA catatan tingkat kelasnya sendiri.
--   * publik (anon): hanya lewat komite_publik() yang mengembalikan angka ringkasan, rekening, dan rincian
--     dengan nama disamarkan (default: inisial). Tabel tidak bisa dibaca langsung oleh anon.

-- ============ Tabel ============
CREATE TABLE IF NOT EXISTS public.komite_settings (
  school_id        uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  judul            text NOT NULL DEFAULT 'Penggalangan Dana Komite',
  deskripsi        text,
  target           numeric(14,2) NOT NULL DEFAULT 0 CHECK (target >= 0),
  batas_waktu      date,
  nama_publik      text NOT NULL DEFAULT 'inisial' CHECK (nama_publik IN ('lengkap', 'inisial', 'anonim')),
  tampilkan_rincian boolean NOT NULL DEFAULT true,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.komite_rekening (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  bank       text NOT NULL,
  nomor      text NOT NULL,
  atas_nama  text NOT NULL,
  catatan    text,
  urutan     integer NOT NULL DEFAULT 0,
  aktif      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_komite_rekening_school ON public.komite_rekening (school_id, urutan);

CREATE TABLE IF NOT EXISTS public.komite_korlas (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade      smallint NOT NULL CHECK (grade IN (7, 8, 9)),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.komite_donasi (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  tanggal     date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Jakarta')::date),
  jumlah      numeric(14,2) NOT NULL CHECK (jumlah > 0 AND jumlah <= 1000000000),
  sumber      text NOT NULL CHECK (sumber IN ('rekening', 'tunai')),
  kategori    text NOT NULL CHECK (kategori IN ('siswa', 'donatur_lain')),
  grade       smallint CHECK (grade IN (7, 8, 9)),
  student_id  uuid REFERENCES public.students(id) ON DELETE SET NULL,
  nama        text NOT NULL,
  rekening_id uuid REFERENCES public.komite_rekening(id) ON DELETE SET NULL,
  keterangan  text,
  dicatat_oleh uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT komite_donasi_grade_kategori CHECK (
    (kategori = 'siswa' AND grade IS NOT NULL) OR (kategori = 'donatur_lain' AND grade IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_komite_donasi_school_tgl ON public.komite_donasi (school_id, tanggal DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_komite_donasi_grade ON public.komite_donasi (school_id, grade);
CREATE INDEX IF NOT EXISTS idx_komite_donasi_student ON public.komite_donasi (student_id);

ALTER TABLE public.komite_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.komite_rekening ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.komite_korlas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.komite_donasi   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.komite_settings, public.komite_rekening, public.komite_korlas, public.komite_donasi
  FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.komite_settings, public.komite_rekening, public.komite_korlas, public.komite_donasi TO authenticated;

-- ============ Fungsi bantu ============
-- Pengelola data komite pada sekolah tertentu: bendahara_komite / admin sekolah itu, atau super_admin.
CREATE OR REPLACE FUNCTION public._komite_can_manage(p_school uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR (p_school IS NOT NULL
          AND p_school = public.get_user_school_id()
          AND (public.has_role(auth.uid(), 'bendahara_komite') OR public.has_role(auth.uid(), 'admin')));
$$;
REVOKE ALL ON FUNCTION public._komite_can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._komite_can_manage(uuid) TO authenticated;

-- Tingkat kelas (7/8/9) milik korlas yang sedang login: penetapan manual, kalau tidak ada dibaca dari email korlasN@...
CREATE OR REPLACE FUNCTION public.komite_my_grade()
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN NOT public.has_role(auth.uid(), 'korlas') THEN NULL ELSE
    COALESCE(
      (SELECT k.grade FROM public.komite_korlas k WHERE k.user_id = auth.uid()),
      substring(lower(COALESCE(auth.jwt() ->> 'email', '')) from '^korlas([789])@')::smallint
    ) END;
$$;
REVOKE ALL ON FUNCTION public.komite_my_grade() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_my_grade() TO authenticated;

-- Menyamarkan nama untuk tampilan publik.
CREATE OR REPLACE FUNCTION public._komite_mask_nama(p_nama text, p_mode text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_mode = 'lengkap' THEN btrim(COALESCE(p_nama, ''))
    WHEN p_mode = 'inisial' THEN
      COALESCE(NULLIF(array_to_string(ARRAY(
        SELECT upper(left(w, 1)) || '***'
        FROM unnest(regexp_split_to_array(btrim(COALESCE(p_nama, '')), '\s+')) AS w
        WHERE w <> ''), ' '), ''), 'Hamba Allah')
    ELSE 'Hamba Allah'
  END;
$$;

-- ============ Trigger ============
CREATE OR REPLACE FUNCTION public._komite_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_komite_settings_touch ON public.komite_settings;
CREATE TRIGGER trg_komite_settings_touch BEFORE UPDATE ON public.komite_settings
  FOR EACH ROW EXECUTE FUNCTION public._komite_touch();
DROP TRIGGER IF EXISTS trg_komite_rekening_touch ON public.komite_rekening;
CREATE TRIGGER trg_komite_rekening_touch BEFORE UPDATE ON public.komite_rekening
  FOR EACH ROW EXECUTE FUNCTION public._komite_touch();
DROP TRIGGER IF EXISTS trg_komite_korlas_touch ON public.komite_korlas;
CREATE TRIGGER trg_komite_korlas_touch BEFORE UPDATE ON public.komite_korlas
  FOR EACH ROW EXECUTE FUNCTION public._komite_touch();

DROP TRIGGER IF EXISTS trg_a_komite_rekening_school ON public.komite_rekening;
CREATE TRIGGER trg_a_komite_rekening_school BEFORE INSERT ON public.komite_rekening
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
DROP TRIGGER IF EXISTS trg_a_komite_donasi_school ON public.komite_donasi;
CREATE TRIGGER trg_a_komite_donasi_school BEFORE INSERT ON public.komite_donasi
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

-- Validasi & pengisian otomatis catatan pendapatan. Tingkat kelas dan nama siswa TIDAK dipercaya dari klien:
-- diambil dari data siswa (jadi korlas tidak bisa mengaku-aku tingkat lain).
CREATE OR REPLACE FUNCTION public._komite_donasi_validasi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text; v_grade integer; v_school uuid; v_found boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.dicatat_oleh := COALESCE(NEW.dicatat_oleh, auth.uid());
  END IF;

  IF NEW.kategori = 'siswa' THEN
    IF NEW.student_id IS NULL AND TG_OP = 'UPDATE' AND OLD.kategori = 'siswa' THEN
      -- siswa dihapus dari data induk (FK ON DELETE SET NULL memicu UPDATE ini): pertahankan nama & tingkat kelas lama
      NEW.grade := OLD.grade; NEW.nama := OLD.nama;
    ELSIF TG_OP = 'INSERT' OR NEW.student_id IS DISTINCT FROM OLD.student_id OR OLD.kategori <> 'siswa' THEN
      IF NEW.student_id IS NULL THEN
        RAISE EXCEPTION 'Pilih siswa penyumbang' USING ERRCODE = '22023';
      END IF;
      SELECT s.full_name, c.grade, s.school_id, true INTO v_name, v_grade, v_school, v_found
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
    END IF;
  ELSE
    NEW.grade := NULL;
    NEW.student_id := NULL;
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

DROP TRIGGER IF EXISTS trg_b_komite_donasi_validasi ON public.komite_donasi;
CREATE TRIGGER trg_b_komite_donasi_validasi BEFORE INSERT OR UPDATE ON public.komite_donasi
  FOR EACH ROW EXECUTE FUNCTION public._komite_donasi_validasi();

-- ============ Kebijakan RLS ============
DROP POLICY IF EXISTS komite_settings_kelola ON public.komite_settings;
CREATE POLICY komite_settings_kelola ON public.komite_settings FOR ALL TO authenticated
  USING (public._komite_can_manage(school_id)) WITH CHECK (public._komite_can_manage(school_id));

DROP POLICY IF EXISTS komite_rekening_kelola ON public.komite_rekening;
CREATE POLICY komite_rekening_kelola ON public.komite_rekening FOR ALL TO authenticated
  USING (public._komite_can_manage(school_id)) WITH CHECK (public._komite_can_manage(school_id));

DROP POLICY IF EXISTS komite_korlas_kelola ON public.komite_korlas;
CREATE POLICY komite_korlas_kelola ON public.komite_korlas FOR ALL TO authenticated
  USING (public._komite_can_manage(school_id)) WITH CHECK (public._komite_can_manage(school_id));
DROP POLICY IF EXISTS komite_korlas_baca_sendiri ON public.komite_korlas;
CREATE POLICY komite_korlas_baca_sendiri ON public.komite_korlas FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS komite_donasi_kelola ON public.komite_donasi;
CREATE POLICY komite_donasi_kelola ON public.komite_donasi FOR ALL TO authenticated
  USING (public._komite_can_manage(school_id)) WITH CHECK (public._komite_can_manage(school_id));
-- Korlas: hanya MEMBACA sumbangan siswa tingkat kelasnya. Tidak ada kebijakan tulis untuk korlas.
DROP POLICY IF EXISTS komite_donasi_korlas_baca ON public.komite_donasi;
CREATE POLICY komite_donasi_korlas_baca ON public.komite_donasi FOR SELECT TO authenticated
  USING (kategori = 'siswa'
         AND school_id = public.get_user_school_id()
         AND public.has_role(auth.uid(), 'korlas')
         AND grade = public.komite_my_grade());

-- ============ RPC untuk dashboard ============
-- Daftar siswa aktif untuk dipilih. Korlas: hanya tingkat kelasnya. Pengelola: semua (atau p_grade).
CREATE OR REPLACE FUNCTION public.komite_students(p_grade integer DEFAULT NULL)
RETURNS TABLE (student_id uuid, nis text, nama text, kelas text, grade integer, total numeric, jumlah_kali integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_grade integer := p_grade;
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Akun ini belum terhubung ke sekolah' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(auth.uid(), 'korlas') THEN
    v_grade := public.komite_my_grade();
    IF v_grade IS NULL THEN
      RAISE EXCEPTION 'Tingkat kelas akun korlas ini belum ditetapkan' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public._komite_can_manage(v_school) THEN
    RAISE EXCEPTION 'Tidak berwenang' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id, s.nis, s.full_name, c.name, c.grade,
         COALESCE(SUM(d.jumlah), 0)::numeric, COUNT(d.id)::integer
  FROM public.students s
  JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.komite_donasi d ON d.student_id = s.id AND d.school_id = v_school
  WHERE s.school_id = v_school
    AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
    AND c.grade IN (7, 8, 9)
    AND (v_grade IS NULL OR c.grade = v_grade)
  GROUP BY s.id, s.nis, s.full_name, c.name, c.grade
  ORDER BY c.name, s.full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.komite_students(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_students(integer) TO authenticated;

-- Input sumbangan siswa oleh korlas (atau pengelola). Menolak siswa di luar tingkat kelas korlas.
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
  v_my integer; v_sgrade integer; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_school IS NULL THEN
    RAISE EXCEPTION 'Akun ini belum terhubung ke sekolah' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(auth.uid(), 'korlas') THEN
    v_my := public.komite_my_grade();
    IF v_my IS NULL THEN
      RAISE EXCEPTION 'Tingkat kelas akun korlas ini belum ditetapkan' USING ERRCODE = '42501';
    END IF;
    SELECT c.grade INTO v_sgrade
    FROM public.students s JOIN public.classes c ON c.id = s.class_id
    WHERE s.id = p_student_id AND s.school_id = v_school;
    IF v_sgrade IS DISTINCT FROM v_my THEN
      RAISE EXCEPTION 'Siswa ini bukan dari tingkat kelas %', v_my USING ERRCODE = '42501';
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

-- Daftar akun korlas di sekolah + tingkat kelas efektifnya (untuk layar "Korlas" milik bendahara komite).
CREATE OR REPLACE FUNCTION public.komite_korlas_list()
RETURNS TABLE (user_id uuid, email text, nama text, grade smallint, asal text)
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
         COALESCE(k.grade, substring(lower(u.email) from '^korlas([789])@')::smallint),
         CASE WHEN k.grade IS NOT NULL THEN 'manual'
              WHEN substring(lower(u.email) from '^korlas([789])@') IS NOT NULL THEN 'email'
              ELSE NULL END::text
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.komite_korlas k ON k.user_id = ur.user_id
  WHERE ur.role = 'korlas' AND ur.school_id = v_school
  ORDER BY u.email;
END;
$$;
REVOKE ALL ON FUNCTION public.komite_korlas_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_korlas_list() TO authenticated;

-- Tetapkan tingkat kelas korlas (p_grade NULL = hapus penetapan manual, kembali ke pembacaan dari email).
CREATE OR REPLACE FUNCTION public.komite_set_korlas(p_user uuid, p_grade integer)
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
  IF p_grade IS NULL THEN
    DELETE FROM public.komite_korlas WHERE user_id = p_user;
  ELSE
    IF p_grade NOT IN (7, 8, 9) THEN
      RAISE EXCEPTION 'Tingkat kelas harus 7, 8, atau 9' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.komite_korlas (user_id, school_id, grade) VALUES (p_user, v_school, p_grade)
    ON CONFLICT (user_id) DO UPDATE SET grade = EXCLUDED.grade, school_id = EXCLUDED.school_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.komite_set_korlas(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.komite_set_korlas(uuid, integer) TO authenticated;

-- ============ RPC publik ============
-- Satu-satunya jalan data komite untuk pengunjung (anon). Hanya angka, rekening, dan rincian ber-nama-samaran.
-- Situs ini pada praktiknya satu sekolah; pemilihan sekolah dijelaskan di bawah.
CREATE OR REPLACE FUNCTION public.komite_publik(p_school uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st public.komite_settings;
  v_total numeric; v_rek numeric; v_tun numeric; v_cnt integer;
  v_grades jsonb; v_lain jsonb; v_rekening jsonb; v_rincian jsonb; v_upd timestamptz;
BEGIN
  IF p_school IS NOT NULL AND auth.uid() IS NOT NULL
     AND (p_school = public.get_user_school_id() OR public.is_super_admin()) THEN
    -- dashboard: pengguna yang login meminta ringkasan sekolahnya sendiri
    SELECT ks.* INTO st FROM public.komite_settings ks WHERE ks.school_id = p_school;
  ELSE
    -- publik: utamakan sekolah yang dipakai situs (pengaturan sekolah terbaru, sama seperti PublicLayout);
    -- bila sekolah itu belum punya pengaturan komite, pakai pengaturan komite terbaru.
    SELECT ks.* INTO st FROM public.komite_settings ks
    ORDER BY (ks.school_id = (SELECT ss.school_id FROM public.school_settings ss ORDER BY ss.created_at DESC LIMIT 1)) DESC NULLS LAST,
             ks.updated_at DESC
    LIMIT 1;
  END IF;
  IF st.school_id IS NULL THEN
    RETURN jsonb_build_object('configured', false);
  END IF;

  SELECT COALESCE(SUM(jumlah), 0), COALESCE(SUM(jumlah) FILTER (WHERE sumber = 'rekening'), 0),
         COALESCE(SUM(jumlah) FILTER (WHERE sumber = 'tunai'), 0), COUNT(*), MAX(created_at)
    INTO v_total, v_rek, v_tun, v_cnt, v_upd
  FROM public.komite_donasi WHERE school_id = st.school_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'grade', g.grade,
           'total', COALESCE(x.total, 0), 'jumlah', COALESCE(x.cnt, 0),
           'rekening', COALESCE(x.rek, 0), 'tunai', COALESCE(x.tun, 0),
           'siswa_penyumbang', COALESCE(x.donors, 0),
           'siswa_total', COALESCE(sc.n, 0)) ORDER BY g.grade), '[]'::jsonb)
    INTO v_grades
  FROM generate_series(7, 9) AS g(grade)
  LEFT JOIN (
    SELECT d.grade, SUM(d.jumlah) AS total, COUNT(*) AS cnt,
           SUM(d.jumlah) FILTER (WHERE d.sumber = 'rekening') AS rek,
           SUM(d.jumlah) FILTER (WHERE d.sumber = 'tunai') AS tun,
           COUNT(DISTINCT d.student_id) AS donors
    FROM public.komite_donasi d WHERE d.school_id = st.school_id AND d.kategori = 'siswa' GROUP BY d.grade
  ) x ON x.grade = g.grade
  LEFT JOIN (
    SELECT c.grade, COUNT(*) AS n
    FROM public.students s JOIN public.classes c ON c.id = s.class_id
    WHERE s.school_id = st.school_id AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
    GROUP BY c.grade
  ) sc ON sc.grade = g.grade;

  SELECT jsonb_build_object(
           'total', COALESCE(SUM(jumlah), 0), 'jumlah', COUNT(*),
           'rekening', COALESCE(SUM(jumlah) FILTER (WHERE sumber = 'rekening'), 0),
           'tunai', COALESCE(SUM(jumlah) FILTER (WHERE sumber = 'tunai'), 0))
    INTO v_lain
  FROM public.komite_donasi WHERE school_id = st.school_id AND kategori = 'donatur_lain';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'bank', r.bank, 'nomor', r.nomor, 'atas_nama', r.atas_nama, 'catatan', r.catatan)
           ORDER BY r.urutan, r.created_at), '[]'::jsonb)
    INTO v_rekening
  FROM public.komite_rekening r WHERE r.school_id = st.school_id AND r.aktif;

  IF st.tampilkan_rincian THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'tanggal', t.tanggal, 'jumlah', t.jumlah, 'sumber', t.sumber, 'kategori', t.kategori,
             'grade', t.grade, 'nama', public._komite_mask_nama(t.nama, st.nama_publik))
             ORDER BY t.tanggal DESC, t.created_at DESC), '[]'::jsonb)
      INTO v_rincian
    FROM (SELECT * FROM public.komite_donasi WHERE school_id = st.school_id
          ORDER BY tanggal DESC, created_at DESC LIMIT 300) t;
  ELSE
    v_rincian := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'configured', true,
    'judul', st.judul, 'deskripsi', st.deskripsi, 'target', st.target, 'batas_waktu', st.batas_waktu,
    'tampilkan_rincian', st.tampilkan_rincian, 'nama_publik', st.nama_publik,
    'total', v_total, 'rekening_total', v_rek, 'tunai_total', v_tun, 'jumlah', v_cnt,
    'per_tingkat', v_grades, 'donatur_lain', v_lain,
    'rekening', v_rekening, 'rincian', v_rincian,
    'diperbarui', GREATEST(v_upd, st.updated_at));
END;
$$;
REVOKE ALL ON FUNCTION public.komite_publik(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.komite_publik(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
