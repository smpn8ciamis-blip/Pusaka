-- Riwayat jumlah siswa per rombel/tingkat setiap akhir bulan.
-- Snapshot disimpan sebagai data tetap sehingga tetap bisa dilihat walau siswa sudah mutasi/pindah kelas.

CREATE TABLE IF NOT EXISTS public.student_count_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid REFERENCES public.schools(id),
  period date NOT NULL,                 -- tanggal akhir bulan yang direkam
  academic_year text,
  class_id uuid,                        -- tanpa FK agar riwayat tetap ada bila kelas dihapus
  class_name text NOT NULL,
  grade integer NOT NULL,
  male integer NOT NULL DEFAULT 0,
  female integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',  -- auto (terjadwal) | lazy (disusul saat dashboard dibuka) | manual
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_snap_class_period ON public.student_count_snapshots(period, class_id);
CREATE INDEX IF NOT EXISTS idx_student_snap_school_period ON public.student_count_snapshots(school_id, period DESC);

GRANT SELECT, DELETE ON public.student_count_snapshots TO authenticated;
GRANT ALL ON public.student_count_snapshots TO service_role;
ALTER TABLE public.student_count_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_isolation_student_count_snapshots" ON public.student_count_snapshots;
CREATE POLICY "school_isolation_student_count_snapshots" ON public.student_count_snapshots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());
DROP POLICY IF EXISTS "student_snapshots_select" ON public.student_count_snapshots;
CREATE POLICY "student_snapshots_select" ON public.student_count_snapshots
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "student_snapshots_admin_delete" ON public.student_count_snapshots;
CREATE POLICY "student_snapshots_admin_delete" ON public.student_count_snapshots
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

-- Inti: rekam ulang seluruh snapshot satu sekolah untuk satu periode (akhir bulan)
CREATE OR REPLACE FUNCTION public._capture_student_snapshot(_school uuid, _period date, _source text, _by uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p date := (date_trunc('month', _period) + interval '1 month - 1 day')::date;
  n integer;
BEGIN
  DELETE FROM public.student_count_snapshots WHERE school_id IS NOT DISTINCT FROM _school AND period = p;

  INSERT INTO public.student_count_snapshots
    (school_id, period, academic_year, class_id, class_name, grade, male, female, total, source, captured_by)
  SELECT c.school_id, p, c.academic_year, c.id, c.name, c.grade,
         count(s.id) FILTER (WHERE s.gender = 'L'),
         count(s.id) FILTER (WHERE s.gender = 'P'),
         count(s.id), _source, _by
  FROM public.classes c
  JOIN public.students s ON s.class_id = c.id AND s.status = 'aktif' AND s.is_alumni = false
  WHERE c.school_id IS NOT DISTINCT FROM _school
  GROUP BY c.id, c.school_id, c.academic_year, c.name, c.grade;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._capture_student_snapshot(uuid, date, text, uuid) FROM PUBLIC, anon, authenticated;

-- Admin / kesiswaan: simpan snapshot bulan tertentu (default: akhir bulan ini) berdasarkan data SAAT INI
CREATE OR REPLACE FUNCTION public.capture_student_snapshot(_period date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya admin atau kesiswaan yang dapat menyimpan snapshot';
  END IF;
  RETURN public._capture_student_snapshot(public.get_user_school_id(), _period, 'manual', auth.uid());
END;
$$;

-- Dipanggil saat dashboard dibuka: bila snapshot akhir bulan lalu belum ada, direkam sekarang (ditandai 'lazy')
CREATE OR REPLACE FUNCTION public.ensure_student_snapshots()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  school uuid := public.get_user_school_id();
  prev_end date := (date_trunc('month', CURRENT_DATE) - interval '1 day')::date;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan') OR public.is_super_admin()) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.student_count_snapshots WHERE school_id IS NOT DISTINCT FROM school AND period = prev_end) THEN
    RETURN false;
  END IF;
  -- hanya bila sekolah memang sudah punya riwayat atau punya siswa aktif
  PERFORM public._capture_student_snapshot(school, prev_end, 'lazy', auth.uid());
  RETURN true;
END;
$$;

-- Dijalankan bot terjadwal (service role) pada akhir bulan untuk semua sekolah
CREATE OR REPLACE FUNCTION public.capture_all_student_snapshots(_period date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; total integer := 0;
BEGIN
  FOR r IN SELECT DISTINCT school_id FROM public.classes LOOP
    total := total + public._capture_student_snapshot(r.school_id, _period, 'auto', NULL);
  END LOOP;
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_student_snapshot(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_student_snapshots() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.capture_all_student_snapshots(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_student_snapshot(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_student_snapshots() TO authenticated;
GRANT EXECUTE ON FUNCTION public.capture_all_student_snapshots(date) TO service_role;
