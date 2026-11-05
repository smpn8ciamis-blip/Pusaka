-- =====================================================================
-- MUTASI MASUK
-- Siswa baru yang masuk saat tahun ajaran/semester berjalan hanya bisa ditambahkan lewat
-- menu "Mutasi Masuk" (admin & kesiswaan). Menu itu mencatat data pindahan (sekolah asal,
-- nomor surat, dst.), membuat siswa, dan menyarankan NIS otomatis.
--
-- Penegakan di basis data: pengguna aplikasi (admin/kesiswaan/guru/wali kelas) TIDAK bisa
-- lagi INSERT langsung ke tabel students (form Siswa, impor, editor massal, tambah siswa wali
-- kelas) kecuali admin menyalakan "Penerimaan awal tahun ajaran" (impor massal siswa baru).
-- Tetap diizinkan: super admin, service role/bot/edge function, dan SQL Editor (tanpa auth.uid()).
--
-- Jalankan sekali di SQL Editor. Aman dijalankan ulang.
-- =====================================================================

-- 1. Pengaturan -----------------------------------------------------------
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS nis_pattern text,
  ADD COLUMN IF NOT EXISTS allow_direct_student_insert boolean NOT NULL DEFAULT false;

-- 2. Catatan mutasi masuk ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  admission_date date NOT NULL DEFAULT CURRENT_DATE,
  academic_year text,
  semester integer,
  origin_school text NOT NULL,
  origin_class text,
  transfer_letter_no text,
  transfer_letter_date date,
  reason text,
  notes text,
  assigned_nis text,
  created_by uuid DEFAULT auth.uid(),
  school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);
CREATE INDEX IF NOT EXISTS idx_student_admissions_date ON public.student_admissions (admission_date DESC);
CREATE INDEX IF NOT EXISTS idx_student_admissions_school ON public.student_admissions (school_id);

ALTER TABLE public.student_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_admissions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.student_admissions FROM authenticated;
GRANT SELECT, DELETE ON public.student_admissions TO authenticated;
-- hanya kolom keterangan yang boleh diedit (siswa & NIS tidak berubah dari sini)
GRANT UPDATE (admission_date, origin_school, origin_class, transfer_letter_no, transfer_letter_date, reason, notes)
  ON public.student_admissions TO authenticated;
GRANT ALL ON public.student_admissions TO service_role;

DROP TRIGGER IF EXISTS update_student_admissions_updated_at ON public.student_admissions;
CREATE TRIGGER update_student_admissions_updated_at
  BEFORE UPDATE ON public.student_admissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "school_isolation_student_admissions" ON public.student_admissions;
CREATE POLICY "school_isolation_student_admissions" ON public.student_admissions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "student_admissions_select" ON public.student_admissions;
CREATE POLICY "student_admissions_select" ON public.student_admissions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan') OR public.is_super_admin());

DROP POLICY IF EXISTS "student_admissions_update" ON public.student_admissions;
CREATE POLICY "student_admissions_update" ON public.student_admissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan') OR public.is_super_admin());

-- hanya admin yang boleh menghapus catatan (siswanya tidak ikut terhapus)
DROP POLICY IF EXISTS "student_admissions_delete" ON public.student_admissions;
CREATE POLICY "student_admissions_delete" ON public.student_admissions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

-- 3. Pembantu ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._mm_can_use()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan') OR public.is_super_admin())
$$;
REVOKE ALL ON FUNCTION public._mm_can_use() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mm_can_use() TO authenticated;

-- baris pengaturan sekolah milik pengguna (bila ada beberapa sekolah)
CREATE OR REPLACE FUNCTION public._mm_settings_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ss.id FROM public.school_settings ss
   ORDER BY (ss.school_id IS NOT DISTINCT FROM public.get_user_school_id()) DESC NULLS LAST, ss.created_at DESC
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._mm_settings_id() FROM PUBLIC, anon, authenticated;

-- 4. Pengaturan untuk halaman Mutasi Masuk -----------------------------------
CREATE OR REPLACE FUNCTION public.mutasi_masuk_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.school_settings;
BEGIN
  IF NOT public._mm_can_use() THEN RAISE EXCEPTION 'Tidak berhak'; END IF;
  SELECT * INTO r FROM public.school_settings WHERE id = public._mm_settings_id();
  RETURN jsonb_build_object(
    'nis_pattern', coalesce(nullif(btrim(r.nis_pattern), ''), '{TAHUN}{URUT:3}'),
    'allow_direct', coalesce(r.allow_direct_student_insert, false),
    'academic_year', r.academic_year,
    'semester', r.active_semester);
END;
$$;
REVOKE ALL ON FUNCTION public.mutasi_masuk_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mutasi_masuk_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.mutasi_masuk_save_settings(p_pattern text, p_allow boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := public._mm_settings_id();
  v_pat text := btrim(coalesce(p_pattern, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya admin yang boleh mengubah pengaturan ini';
  END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Pengaturan sekolah belum dibuat'; END IF;
  IF v_pat = '' OR char_length(v_pat) > 40 THEN RAISE EXCEPTION 'Pola NIS harus 1-40 karakter'; END IF;
  -- tepat satu token {URUT} / {URUT:n}; token lain hanya {TAHUN} {YY} {TINGKAT}
  IF v_pat !~ '\{URUT(:[0-9]{1,2})?\}' OR
     (SELECT count(*) FROM regexp_matches(v_pat, '\{URUT(?::[0-9]{1,2})?\}', 'g')) <> 1 THEN
    RAISE EXCEPTION 'Pola NIS harus memuat tepat satu {URUT} atau {URUT:n}';
  END IF;
  IF regexp_replace(v_pat, '\{(TAHUN|YY|TINGKAT|URUT(:[0-9]{1,2})?)\}', '', 'g') ~ '[{}]' THEN
    RAISE EXCEPTION 'Pola NIS memuat token yang tidak dikenal';
  END IF;
  UPDATE public.school_settings
     SET nis_pattern = v_pat, allow_direct_student_insert = coalesce(p_allow, false)
   WHERE id = v_id;
  RETURN jsonb_build_object('nis_pattern', v_pat, 'allow_direct', coalesce(p_allow, false));
END;
$$;
REVOKE ALL ON FUNCTION public.mutasi_masuk_save_settings(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mutasi_masuk_save_settings(text, boolean) TO authenticated;

-- 5. Simpan mutasi masuk (siswa + catatan, satu transaksi) ---------------------
CREATE OR REPLACE FUNCTION public.mutasi_masuk_create(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class uuid := nullif(p ->> 'class_id', '')::uuid;
  v_nis text := btrim(coalesce(p ->> 'nis', ''));
  v_nisn text := nullif(btrim(coalesce(p ->> 'nisn', '')), '');
  v_name text := btrim(coalesce(p ->> 'full_name', ''));
  v_gender text := nullif(btrim(coalesce(p ->> 'gender', '')), '');
  v_origin text := btrim(coalesce(p ->> 'origin_school', ''));
  v_phone text := nullif(regexp_replace(coalesce(p ->> 'parent_phone', ''), '\D', '', 'g'), '');
  v_birth date;
  v_adm date;
  v_letter_date date;
  c public.classes;
  s public.school_settings;
  v_school uuid;
  v_dup text;
  v_student uuid;
  v_adm_id uuid;
BEGIN
  IF NOT public._mm_can_use() THEN RAISE EXCEPTION 'Hanya admin dan kesiswaan yang boleh mencatat mutasi masuk'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Nama lengkap wajib diisi'; END IF;
  IF v_nis = '' THEN RAISE EXCEPTION 'NIS wajib diisi'; END IF;
  IF v_origin = '' THEN RAISE EXCEPTION 'Sekolah asal wajib diisi'; END IF;
  IF v_class IS NULL THEN RAISE EXCEPTION 'Kelas tujuan wajib dipilih'; END IF;
  IF v_gender IS NOT NULL AND v_gender NOT IN ('L', 'P') THEN RAISE EXCEPTION 'Jenis kelamin harus L atau P'; END IF;

  BEGIN
    v_birth := nullif(p ->> 'birth_date', '')::date;
    v_adm := coalesce(nullif(p ->> 'admission_date', '')::date, CURRENT_DATE);
    v_letter_date := nullif(p ->> 'transfer_letter_date', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Format tanggal tidak valid';
  END;

  SELECT * INTO c FROM public.classes WHERE id = v_class;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kelas tujuan tidak ditemukan'; END IF;
  v_school := coalesce(c.school_id, public.get_user_school_id());
  IF NOT public.is_super_admin() AND v_school IS DISTINCT FROM public.get_user_school_id() THEN
    RAISE EXCEPTION 'Kelas tujuan bukan milik sekolah Anda';
  END IF;

  SELECT full_name INTO v_dup FROM public.students WHERE nis = v_nis LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'NIS % sudah dipakai oleh %. Ubah NIS atau gunakan saran NIS berikutnya.', v_nis, v_dup; END IF;
  IF v_nisn IS NOT NULL THEN
    SELECT full_name INTO v_dup FROM public.students WHERE nisn = v_nisn LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'NISN % sudah terdaftar atas nama %', v_nisn, v_dup; END IF;
  END IF;

  SELECT * INTO s FROM public.school_settings WHERE id = public._mm_settings_id();

  PERFORM set_config('pusaka.allow_student_insert', 'on', true);
  INSERT INTO public.students
    (nis, nisn, full_name, class_id, gender, birth_date, birth_place, address, parent_name, parent_phone, status, school_id)
  VALUES
    (v_nis, v_nisn, v_name, v_class, v_gender, v_birth,
     nullif(btrim(coalesce(p ->> 'birth_place', '')), ''), nullif(btrim(coalesce(p ->> 'address', '')), ''),
     nullif(btrim(coalesce(p ->> 'parent_name', '')), ''), v_phone, 'aktif', v_school)
  RETURNING id INTO v_student;
  PERFORM set_config('pusaka.allow_student_insert', 'off', true);

  INSERT INTO public.student_admissions
    (student_id, class_id, admission_date, academic_year, semester, origin_school, origin_class,
     transfer_letter_no, transfer_letter_date, reason, notes, assigned_nis, created_by, school_id)
  VALUES
    (v_student, v_class, v_adm, coalesce(s.academic_year, c.academic_year), s.active_semester, v_origin,
     nullif(btrim(coalesce(p ->> 'origin_class', '')), ''), nullif(btrim(coalesce(p ->> 'transfer_letter_no', '')), ''),
     v_letter_date, nullif(btrim(coalesce(p ->> 'reason', '')), ''), nullif(btrim(coalesce(p ->> 'notes', '')), ''),
     v_nis, auth.uid(), v_school)
  RETURNING id INTO v_adm_id;

  RETURN jsonb_build_object('student_id', v_student, 'admission_id', v_adm_id, 'nis', v_nis);
END;
$$;
REVOKE ALL ON FUNCTION public.mutasi_masuk_create(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mutasi_masuk_create(jsonb) TO authenticated;

-- 6. Penegakan: siswa baru hanya lewat Mutasi Masuk --------------------------------
CREATE OR REPLACE FUNCTION public.students_block_direct_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allow boolean;
BEGIN
  -- lewat menu Mutasi Masuk (RPC mutasi_masuk_create)
  IF current_setting('pusaka.allow_student_insert', true) = 'on' THEN RETURN NEW; END IF;
  -- service role, bot, edge function, SQL Editor (tanpa pengguna aplikasi)
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_super_admin() THEN RETURN NEW; END IF;

  SELECT coalesce(ss.allow_direct_student_insert, false) INTO v_allow
    FROM public.school_settings ss
   WHERE ss.id = public._mm_settings_id();
  IF coalesce(v_allow, false) THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Siswa baru hanya dapat ditambahkan lewat menu Mutasi Masuk. Untuk impor massal awal tahun ajaran, admin dapat menyalakan "Penerimaan awal tahun ajaran" di menu Mutasi Masuk.';
END;
$$;
REVOKE ALL ON FUNCTION public.students_block_direct_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_students_block_direct_insert ON public.students;
CREATE TRIGGER trg_students_block_direct_insert
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.students_block_direct_insert();
