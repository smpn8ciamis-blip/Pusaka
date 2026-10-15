-- Riwayat rombel per tahun pelajaran + kenaikan kelas dengan hasil (naik / tinggal / lulus).
-- Riwayat disimpan sebagai data tetap (tanpa FK ke kelas) sehingga laporan tahun lalu tetap menampilkan kelas lamanya.

CREATE TABLE IF NOT EXISTS public.student_class_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid REFERENCES public.schools(id),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year text NOT NULL DEFAULT '',
  class_id uuid,                         -- tanpa FK agar riwayat tetap ada bila kelas dihapus
  class_name text NOT NULL,
  grade integer,
  outcome text NOT NULL DEFAULT 'aktif' CHECK (outcome IN ('aktif','naik','tinggal','lulus')),
  to_class_name text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  UNIQUE (student_id, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_sch_school_year ON public.student_class_history(school_id, academic_year);

GRANT SELECT ON public.student_class_history TO authenticated;
GRANT ALL ON public.student_class_history TO service_role;
ALTER TABLE public.student_class_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_isolation_student_class_history" ON public.student_class_history;
CREATE POLICY "school_isolation_student_class_history" ON public.student_class_history
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());
DROP POLICY IF EXISTS "student_class_history_select" ON public.student_class_history;
CREATE POLICY "student_class_history_select" ON public.student_class_history
  FOR SELECT TO authenticated USING (true);

-- Menjaga baris tahun berjalan ("aktif") selalu mengikuti kelas siswa saat ini
CREATE OR REPLACE FUNCTION public.sync_student_class_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE c record;
BEGIN
  IF NEW.class_id IS NULL THEN RETURN NEW; END IF;
  SELECT id, name, grade, academic_year INTO c FROM public.classes WHERE id = NEW.class_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO public.student_class_history (school_id, student_id, academic_year, class_id, class_name, grade, outcome)
  VALUES (NEW.school_id, NEW.id, COALESCE(c.academic_year, ''), c.id, c.name, c.grade, 'aktif')
  ON CONFLICT (student_id, academic_year) DO UPDATE
    SET class_id = EXCLUDED.class_id, class_name = EXCLUDED.class_name, grade = EXCLUDED.grade
    WHERE public.student_class_history.outcome = 'aktif';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_student_class_history ON public.students;
CREATE TRIGGER trg_sync_student_class_history
  AFTER INSERT OR UPDATE OF class_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.sync_student_class_history();

-- Isi awal: kelas saat ini dari seluruh siswa yang masih punya kelas
INSERT INTO public.student_class_history (school_id, student_id, academic_year, class_id, class_name, grade, outcome)
SELECT s.school_id, s.id, COALESCE(c.academic_year, ''), c.id, c.name, c.grade, 'aktif'
FROM public.students s JOIN public.classes c ON c.id = s.class_id
ON CONFLICT (student_id, academic_year) DO NOTHING;

-- Kenaikan kelas / tinggal kelas / kelulusan, sekaligus mencatat riwayat (atomik)
--   naik    : pindah ke _target_class_id (wajib)
--   tinggal : tetap di tingkat yang sama; pindah ke _target_class_id (kelas tingkat sama tahun baru) bila diisi, jika NULL tetap di kelas lama
--   lulus   : jadi alumni (class_id NULL), graduation_date = hari ini
CREATE OR REPLACE FUNCTION public.promote_students(_student_ids uuid[], _target_class_id uuid, _outcome text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  school uuid := public.get_user_school_id();
  tgt record;
  n integer := 0;
  r record;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan')
          OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Tidak berwenang menaikkan kelas';
  END IF;
  IF _outcome NOT IN ('naik','tinggal','lulus') THEN
    RAISE EXCEPTION 'Hasil tidak valid: %', _outcome;
  END IF;
  IF _outcome = 'naik' AND _target_class_id IS NULL THEN
    RAISE EXCEPTION 'Kelas tujuan wajib untuk kenaikan kelas';
  END IF;
  IF _target_class_id IS NOT NULL THEN
    SELECT id, name, school_id INTO tgt FROM public.classes WHERE id = _target_class_id;
    IF NOT FOUND OR (NOT public.is_super_admin() AND tgt.school_id IS DISTINCT FROM school) THEN
      RAISE EXCEPTION 'Kelas tujuan tidak ditemukan';
    END IF;
  END IF;

  FOR r IN
    SELECT s.id, s.school_id, c.id AS cid, c.name AS cname, c.grade, COALESCE(c.academic_year, '') AS ay
    FROM public.students s JOIN public.classes c ON c.id = s.class_id
    WHERE s.id = ANY(_student_ids) AND s.status = 'aktif' AND s.is_alumni = false
      AND (public.is_super_admin() OR s.school_id IS NOT DISTINCT FROM school)
    FOR UPDATE OF s
  LOOP
    INSERT INTO public.student_class_history
      (school_id, student_id, academic_year, class_id, class_name, grade, outcome, to_class_name, recorded_at, recorded_by)
    VALUES (r.school_id, r.id, r.ay, r.cid, r.cname, r.grade, _outcome,
            CASE WHEN _outcome = 'lulus' THEN 'Alumni' ELSE COALESCE(tgt.name, r.cname) END, now(), auth.uid())
    ON CONFLICT (student_id, academic_year) DO UPDATE
      SET class_id = EXCLUDED.class_id, class_name = EXCLUDED.class_name, grade = EXCLUDED.grade,
          outcome = EXCLUDED.outcome, to_class_name = EXCLUDED.to_class_name,
          recorded_at = now(), recorded_by = auth.uid();

    IF _outcome = 'lulus' THEN
      UPDATE public.students SET class_id = NULL, is_alumni = true, graduation_date = CURRENT_DATE WHERE id = r.id;
    ELSIF _target_class_id IS NOT NULL THEN
      UPDATE public.students SET class_id = _target_class_id WHERE id = r.id;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.promote_students(uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_students(uuid[], uuid, text) TO authenticated;
