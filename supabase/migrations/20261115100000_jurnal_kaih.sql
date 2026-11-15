-- =====================================================================
-- Jurnal Gerakan 7 Kebiasaan Anak Indonesia Hebat (G7KAIH)
--
-- Tujuh kebiasaan: bangun pagi, beribadah, berolahraga, makan sehat dan bergizi, gemar belajar,
-- bermasyarakat, tidur cepat. Siswa mengisi satu jurnal per hari (tabel kaih_journals); wali kelas memantau
-- siswa kelasnya; kesiswaan dan admin memantau semua siswa. Persentase per kebiasaan dihitung dari RPC rekap.
--
-- Hak akses (RLS):
--   * siswa    : melihat jurnal sendiri; menambah/mengubah/menghapus jurnal sendiri untuk 7 hari terakhir s.d. hari ini (WIB)
--   * wali kelas: melihat jurnal siswa kelasnya (kelas saat jurnal dibuat)
--   * kesiswaan : melihat semua jurnal sekolah
--   * admin / super admin: kelola semua
-- Tanggal jurnal tidak boleh di masa depan (trigger). Tabel lama habit_journals (7 Habits Covey) tidak diubah.
-- Aman dijalankan ulang.
-- =====================================================================

-- 1. Pembantu --------------------------------------------------------

-- Wali kelas dari kelas tertentu (sama dengan yang dipakai fitur izin/sakit; dibuat ulang agar migrasi ini mandiri)
CREATE OR REPLACE FUNCTION public.is_homeroom_of_class(p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_class IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.classes c JOIN public.teachers t ON t.id = c.homeroom_teacher_id
    WHERE c.id = p_class AND t.user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.is_homeroom_of_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_homeroom_of_class(uuid) TO authenticated;

-- Tanggal hari ini menurut WIB (server berjalan UTC)
CREATE OR REPLACE FUNCTION public.kaih_today()
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date
$$;
GRANT EXECUTE ON FUNCTION public.kaih_today() TO authenticated;

-- Boleh memantau kelas ini? (super admin, admin, kesiswaan, atau wali kelasnya)
CREATE OR REPLACE FUNCTION public.kaih_can_monitor_class(p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'kesiswaan')
      OR public.is_homeroom_of_class(p_class)
$$;
REVOKE ALL ON FUNCTION public.kaih_can_monitor_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kaih_can_monitor_class(uuid) TO authenticated;

-- 2. Tabel -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kaih_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,   -- kelas siswa saat jurnal dibuat (diisi trigger)
  entry_date date NOT NULL,
  -- 1. Bangun pagi
  wake_done boolean NOT NULL DEFAULT false,
  wake_time time,
  -- 2. Beribadah
  worship_done boolean NOT NULL DEFAULT false,
  worship_note text,
  -- 3. Berolahraga
  exercise_done boolean NOT NULL DEFAULT false,
  exercise_note text,
  exercise_minutes smallint,
  -- 4. Makan sehat dan bergizi
  meal_done boolean NOT NULL DEFAULT false,
  meal_note text,
  -- 5. Gemar belajar
  study_done boolean NOT NULL DEFAULT false,
  study_note text,
  study_minutes smallint,
  -- 6. Bermasyarakat
  social_done boolean NOT NULL DEFAULT false,
  social_note text,
  -- 7. Tidur cepat
  sleep_done boolean NOT NULL DEFAULT false,
  sleep_time time,
  notes text,
  habit_count smallint GENERATED ALWAYS AS (
    (wake_done::int + worship_done::int + exercise_done::int + meal_done::int + study_done::int + social_done::int + sleep_done::int)::smallint
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_kaih_student_date UNIQUE (student_id, entry_date),
  CONSTRAINT ck_kaih_minutes CHECK (
    (exercise_minutes IS NULL OR exercise_minutes BETWEEN 0 AND 1440)
    AND (study_minutes IS NULL OR study_minutes BETWEEN 0 AND 1440)),
  CONSTRAINT ck_kaih_text_len CHECK (
    char_length(coalesce(worship_note, '')) <= 300 AND char_length(coalesce(exercise_note, '')) <= 300
    AND char_length(coalesce(meal_note, '')) <= 300 AND char_length(coalesce(study_note, '')) <= 300
    AND char_length(coalesce(social_note, '')) <= 300 AND char_length(coalesce(notes, '')) <= 1000)
);
CREATE INDEX IF NOT EXISTS idx_kaih_class_date ON public.kaih_journals (class_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_kaih_school_date ON public.kaih_journals (school_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_kaih_date ON public.kaih_journals (entry_date);

-- 3. Trigger: kelas/sekolah dari data siswa, larangan tanggal masa depan, kolom tetap tidak bisa diubah
CREATE OR REPLACE FUNCTION public.kaih_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_class uuid;
  v_school uuid;
BEGIN
  IF NEW.entry_date > public.kaih_today() THEN
    RAISE EXCEPTION 'Tanggal jurnal tidak boleh di masa depan.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT s.class_id, s.school_id INTO v_class, v_school FROM public.students s WHERE s.id = NEW.student_id;
    NEW.class_id := v_class;
    IF v_school IS NOT NULL THEN NEW.school_id := v_school; END IF;
  ELSE
    -- siswa, kelas, dan sekolah tidak boleh dipindah lewat UPDATE
    NEW.student_id := OLD.student_id;
    NEW.class_id := OLD.class_id;
    NEW.school_id := OLD.school_id;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kaih_before_write ON public.kaih_journals;
CREATE TRIGGER kaih_before_write BEFORE INSERT OR UPDATE ON public.kaih_journals
  FOR EACH ROW EXECUTE FUNCTION public.kaih_before_write();
DROP TRIGGER IF EXISTS auto_set_school_id_kaih_journals ON public.kaih_journals;
CREATE TRIGGER auto_set_school_id_kaih_journals BEFORE INSERT ON public.kaih_journals
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

-- 4. RLS -------------------------------------------------------------
ALTER TABLE public.kaih_journals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_isolation_kaih_journals" ON public.kaih_journals;
CREATE POLICY "school_isolation_kaih_journals" ON public.kaih_journals
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

-- Siswa: jurnal sendiri
DROP POLICY IF EXISTS "kaih siswa lihat sendiri" ON public.kaih_journals;
CREATE POLICY "kaih siswa lihat sendiri" ON public.kaih_journals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.student_accounts sa WHERE sa.student_id = kaih_journals.student_id AND sa.user_id = auth.uid()));

DROP POLICY IF EXISTS "kaih siswa tambah sendiri" ON public.kaih_journals;
CREATE POLICY "kaih siswa tambah sendiri" ON public.kaih_journals FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.student_accounts sa WHERE sa.student_id = kaih_journals.student_id AND sa.user_id = auth.uid())
    AND entry_date BETWEEN public.kaih_today() - 7 AND public.kaih_today());

DROP POLICY IF EXISTS "kaih siswa ubah sendiri" ON public.kaih_journals;
CREATE POLICY "kaih siswa ubah sendiri" ON public.kaih_journals FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.student_accounts sa WHERE sa.student_id = kaih_journals.student_id AND sa.user_id = auth.uid())
    AND entry_date >= public.kaih_today() - 7)
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.student_accounts sa WHERE sa.student_id = kaih_journals.student_id AND sa.user_id = auth.uid())
    AND entry_date BETWEEN public.kaih_today() - 7 AND public.kaih_today());

DROP POLICY IF EXISTS "kaih siswa hapus sendiri" ON public.kaih_journals;
CREATE POLICY "kaih siswa hapus sendiri" ON public.kaih_journals FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.student_accounts sa WHERE sa.student_id = kaih_journals.student_id AND sa.user_id = auth.uid())
    AND entry_date >= public.kaih_today() - 7);

-- Pemantau: wali kelas (kelasnya), kesiswaan (semua), admin (semua)
DROP POLICY IF EXISTS "kaih pantau" ON public.kaih_journals;
CREATE POLICY "kaih pantau" ON public.kaih_journals FOR SELECT TO authenticated
  USING (public.kaih_can_monitor_class(class_id));

-- Admin / super admin: kelola penuh
DROP POLICY IF EXISTS "kaih admin kelola" ON public.kaih_journals;
CREATE POLICY "kaih admin kelola" ON public.kaih_journals FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kaih_journals TO authenticated;

-- 5. RPC rekap (SECURITY INVOKER: RLS pemanggil tetap berlaku) -------------

-- Rekap per siswa aktif (termasuk yang belum mengisi). p_class NULL = semua kelas yang boleh dipantau pemanggil.
CREATE OR REPLACE FUNCTION public.kaih_student_summary(p_start date, p_end date, p_class uuid DEFAULT NULL)
RETURNS TABLE (
  student_id uuid, full_name text, nisn text, class_id uuid, class_name text,
  entries int, wake int, worship int, exercise int, meal int, study int, social int, sleep int, last_entry date
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT s.id, s.full_name, s.nisn, s.class_id, c.name,
         count(j.id)::int,
         (count(*) FILTER (WHERE j.wake_done))::int,
         (count(*) FILTER (WHERE j.worship_done))::int,
         (count(*) FILTER (WHERE j.exercise_done))::int,
         (count(*) FILTER (WHERE j.meal_done))::int,
         (count(*) FILTER (WHERE j.study_done))::int,
         (count(*) FILTER (WHERE j.social_done))::int,
         (count(*) FILTER (WHERE j.sleep_done))::int,
         max(j.entry_date)
  FROM public.students s
  LEFT JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.kaih_journals j ON j.student_id = s.id AND j.entry_date BETWEEN p_start AND p_end
  WHERE s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
    AND (p_class IS NULL OR s.class_id = p_class)
    AND public.kaih_can_monitor_class(s.class_id)
  GROUP BY s.id, s.full_name, s.nisn, s.class_id, c.name
  ORDER BY c.name NULLS LAST, s.full_name
$$;
REVOKE ALL ON FUNCTION public.kaih_student_summary(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kaih_student_summary(date, date, uuid) TO authenticated;

-- Tren harian: jumlah jurnal dan jumlah kebiasaan terlaksana per tanggal
CREATE OR REPLACE FUNCTION public.kaih_daily(p_start date, p_end date, p_class uuid DEFAULT NULL)
RETURNS TABLE (entry_date date, entries int, done int)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT j.entry_date, count(*)::int, COALESCE(sum(j.habit_count), 0)::int
  FROM public.kaih_journals j
  WHERE j.entry_date BETWEEN p_start AND p_end
    AND (p_class IS NULL OR j.class_id = p_class)
    AND public.kaih_can_monitor_class(j.class_id)
  GROUP BY j.entry_date
  ORDER BY j.entry_date
$$;
REVOKE ALL ON FUNCTION public.kaih_daily(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kaih_daily(date, date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
