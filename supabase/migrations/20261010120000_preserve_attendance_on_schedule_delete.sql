-- =====================================================================
-- Data absensi / jurnal / nilai TIDAK ikut terhapus saat jadwal dihapus.
--   1. Kolom "snapshot" jadwal (kelas, guru, mapel, TP, semester, hari, jam) di
--      attendance, teaching_journals, grades — terisi otomatis & selalu sinkron.
--   2. FK schedule_id: ON DELETE CASCADE  ->  ON DELETE SET NULL (kolom boleh NULL).
--   3. Rekap absensi (RPC) memakai snapshot, bukan join ke jadwal.
-- =====================================================================

-- 1. kolom snapshot --------------------------------------------------
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS sched_class_id uuid,
  ADD COLUMN IF NOT EXISTS sched_teacher_id uuid,
  ADD COLUMN IF NOT EXISTS sched_subject text,
  ADD COLUMN IF NOT EXISTS sched_academic_year text,
  ADD COLUMN IF NOT EXISTS sched_semester integer,
  ADD COLUMN IF NOT EXISTS sched_day_of_week integer,
  ADD COLUMN IF NOT EXISTS sched_start_time time,
  ADD COLUMN IF NOT EXISTS sched_end_time time;

ALTER TABLE public.teaching_journals
  ADD COLUMN IF NOT EXISTS sched_class_id uuid,
  ADD COLUMN IF NOT EXISTS sched_teacher_id uuid,
  ADD COLUMN IF NOT EXISTS sched_subject text,
  ADD COLUMN IF NOT EXISTS sched_academic_year text,
  ADD COLUMN IF NOT EXISTS sched_semester integer,
  ADD COLUMN IF NOT EXISTS sched_day_of_week integer,
  ADD COLUMN IF NOT EXISTS sched_start_time time,
  ADD COLUMN IF NOT EXISTS sched_end_time time;

ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS sched_class_id uuid,
  ADD COLUMN IF NOT EXISTS sched_teacher_id uuid,
  ADD COLUMN IF NOT EXISTS sched_subject text,
  ADD COLUMN IF NOT EXISTS sched_academic_year text,
  ADD COLUMN IF NOT EXISTS sched_semester integer,
  ADD COLUMN IF NOT EXISTS sched_day_of_week integer,
  ADD COLUMN IF NOT EXISTS sched_start_time time,
  ADD COLUMN IF NOT EXISTS sched_end_time time;

-- 2. isi snapshot otomatis saat insert / schedule_id berubah ------------
CREATE OR REPLACE FUNCTION public.fill_schedule_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.schedule_id IS NOT NULL THEN
    SELECT s.class_id, s.teacher_id, s.subject, s.academic_year, s.semester,
           s.day_of_week, s.start_time, s.end_time
      INTO NEW.sched_class_id, NEW.sched_teacher_id, NEW.sched_subject, NEW.sched_academic_year,
           NEW.sched_semester, NEW.sched_day_of_week, NEW.sched_start_time, NEW.sched_end_time
      FROM public.schedules s
     WHERE s.id = NEW.schedule_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_schedule_snapshot ON public.attendance;
CREATE TRIGGER trg_fill_schedule_snapshot
  BEFORE INSERT OR UPDATE OF schedule_id ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.fill_schedule_snapshot();

DROP TRIGGER IF EXISTS trg_fill_schedule_snapshot ON public.teaching_journals;
CREATE TRIGGER trg_fill_schedule_snapshot
  BEFORE INSERT OR UPDATE OF schedule_id ON public.teaching_journals
  FOR EACH ROW EXECUTE FUNCTION public.fill_schedule_snapshot();

DROP TRIGGER IF EXISTS trg_fill_schedule_snapshot ON public.grades;
CREATE TRIGGER trg_fill_schedule_snapshot
  BEFORE INSERT OR UPDATE OF schedule_id ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.fill_schedule_snapshot();

-- 3. isi data lama (backfill) -------------------------------------------
UPDATE public.attendance t SET
  sched_class_id = s.class_id, sched_teacher_id = s.teacher_id, sched_subject = s.subject,
  sched_academic_year = s.academic_year, sched_semester = s.semester,
  sched_day_of_week = s.day_of_week, sched_start_time = s.start_time, sched_end_time = s.end_time
FROM public.schedules s
WHERE t.schedule_id = s.id AND t.sched_academic_year IS NULL;

UPDATE public.teaching_journals t SET
  sched_class_id = s.class_id, sched_teacher_id = s.teacher_id, sched_subject = s.subject,
  sched_academic_year = s.academic_year, sched_semester = s.semester,
  sched_day_of_week = s.day_of_week, sched_start_time = s.start_time, sched_end_time = s.end_time
FROM public.schedules s
WHERE t.schedule_id = s.id AND t.sched_academic_year IS NULL;

UPDATE public.grades t SET
  sched_class_id = s.class_id, sched_teacher_id = s.teacher_id, sched_subject = s.subject,
  sched_academic_year = s.academic_year, sched_semester = s.semester,
  sched_day_of_week = s.day_of_week, sched_start_time = s.start_time, sched_end_time = s.end_time
FROM public.schedules s
WHERE t.schedule_id = s.id AND t.sched_academic_year IS NULL;

-- 4. jaga snapshot tetap sinkron saat jadwal diedit -----------------------
CREATE OR REPLACE FUNCTION public.sync_schedule_snapshot_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.attendance SET
    sched_class_id = NEW.class_id, sched_teacher_id = NEW.teacher_id, sched_subject = NEW.subject,
    sched_academic_year = NEW.academic_year, sched_semester = NEW.semester,
    sched_day_of_week = NEW.day_of_week, sched_start_time = NEW.start_time, sched_end_time = NEW.end_time
  WHERE schedule_id = NEW.id;
  UPDATE public.teaching_journals SET
    sched_class_id = NEW.class_id, sched_teacher_id = NEW.teacher_id, sched_subject = NEW.subject,
    sched_academic_year = NEW.academic_year, sched_semester = NEW.semester,
    sched_day_of_week = NEW.day_of_week, sched_start_time = NEW.start_time, sched_end_time = NEW.end_time
  WHERE schedule_id = NEW.id;
  UPDATE public.grades SET
    sched_class_id = NEW.class_id, sched_teacher_id = NEW.teacher_id, sched_subject = NEW.subject,
    sched_academic_year = NEW.academic_year, sched_semester = NEW.semester,
    sched_day_of_week = NEW.day_of_week, sched_start_time = NEW.start_time, sched_end_time = NEW.end_time
  WHERE schedule_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_schedule_snapshot ON public.schedules;
CREATE TRIGGER trg_sync_schedule_snapshot
  AFTER UPDATE ON public.schedules
  FOR EACH ROW
  WHEN (
    OLD.class_id IS DISTINCT FROM NEW.class_id OR OLD.teacher_id IS DISTINCT FROM NEW.teacher_id OR
    OLD.subject IS DISTINCT FROM NEW.subject OR OLD.academic_year IS DISTINCT FROM NEW.academic_year OR
    OLD.semester IS DISTINCT FROM NEW.semester OR OLD.day_of_week IS DISTINCT FROM NEW.day_of_week OR
    OLD.start_time IS DISTINCT FROM NEW.start_time OR OLD.end_time IS DISTINCT FROM NEW.end_time
  )
  EXECUTE FUNCTION public.sync_schedule_snapshot_on_update();

-- 5. FK: hapus jadwal tidak lagi menghapus data turunan -------------------
ALTER TABLE public.attendance ALTER COLUMN schedule_id DROP NOT NULL;
ALTER TABLE public.teaching_journals ALTER COLUMN schedule_id DROP NOT NULL;
ALTER TABLE public.grades ALTER COLUMN schedule_id DROP NOT NULL;

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_schedule_id_fkey;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_schedule_id_fkey FOREIGN KEY (schedule_id)
  REFERENCES public.schedules(id) ON DELETE SET NULL;

ALTER TABLE public.teaching_journals DROP CONSTRAINT IF EXISTS teaching_journals_schedule_id_fkey;
ALTER TABLE public.teaching_journals
  ADD CONSTRAINT teaching_journals_schedule_id_fkey FOREIGN KEY (schedule_id)
  REFERENCES public.schedules(id) ON DELETE SET NULL;

ALTER TABLE public.grades DROP CONSTRAINT IF EXISTS grades_schedule_id_fkey;
ALTER TABLE public.grades
  ADD CONSTRAINT grades_schedule_id_fkey FOREIGN KEY (schedule_id)
  REFERENCES public.schedules(id) ON DELETE SET NULL;

-- 6. rekap absensi memakai snapshot (tetap utuh walau jadwal sudah dihapus) --
DROP FUNCTION IF EXISTS public.get_attendance_recap(date, date, text);
CREATE OR REPLACE FUNCTION public.get_attendance_recap(p_start_date date, p_end_date date, p_academic_year text)
RETURNS TABLE(total bigint, hadir bigint, izin bigint, sakit bigint, alpa bigint, belum bigint, expected bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH manual AS (
    SELECT DISTINCT ON (a.student_id, a.date)
      a.student_id, a.date, lower(a.status) AS status
    FROM attendance a
    WHERE a.sched_academic_year = p_academic_year
      AND a.date >= p_start_date AND a.date <= p_end_date
    ORDER BY a.student_id, a.date, a.created_at DESC
  ),
  rfid AS (
    SELECT r.student_id, r.date,
      CASE WHEN lower(r.status) = 'terlambat' THEN 'hadir' ELSE lower(r.status) END AS status
    FROM rfid_attendance r
    INNER JOIN students stu ON stu.id = r.student_id
    INNER JOIN classes c ON c.id = stu.class_id AND c.academic_year = p_academic_year
    WHERE r.date >= p_start_date AND r.date <= p_end_date
      AND NOT EXISTS (SELECT 1 FROM manual m WHERE m.student_id = r.student_id AND m.date = r.date)
  ),
  combined AS (
    SELECT student_id, date, status FROM manual
    UNION ALL
    SELECT student_id, date, status FROM rfid
  ),
  active_students AS (
    SELECT count(*)::bigint AS n
    FROM students stu
    INNER JOIN classes c ON c.id = stu.class_id AND c.academic_year = p_academic_year
    WHERE stu.status = 'aktif' AND COALESCE(stu.is_alumni, false) = false
  ),
  days AS (
    SELECT count(DISTINCT date)::bigint AS n FROM combined
  ),
  agg AS (
    SELECT
      COUNT(*)::bigint AS recorded,
      COALESCE(SUM(CASE WHEN status = 'hadir' THEN 1 ELSE 0 END), 0)::bigint AS hadir,
      COALESCE(SUM(CASE WHEN status = 'izin' THEN 1 ELSE 0 END), 0)::bigint AS izin,
      COALESCE(SUM(CASE WHEN status = 'sakit' THEN 1 ELSE 0 END), 0)::bigint AS sakit,
      COALESCE(SUM(CASE WHEN status = 'alpa' THEN 1 ELSE 0 END), 0)::bigint AS alpa
    FROM combined
  )
  SELECT
    agg.recorded,
    agg.hadir, agg.izin, agg.sakit, agg.alpa,
    GREATEST((SELECT n FROM active_students) * (SELECT n FROM days) - agg.recorded, 0)::bigint AS belum,
    GREATEST((SELECT n FROM active_students) * (SELECT n FROM days), agg.recorded)::bigint AS expected
  FROM agg;
$$;

DROP FUNCTION IF EXISTS public.get_attendance_by_class(date, date, text);
CREATE OR REPLACE FUNCTION public.get_attendance_by_class(p_start_date date, p_end_date date, p_academic_year text)
RETURNS TABLE(class_id uuid, hadir bigint, izin bigint, sakit bigint, alpa bigint, belum bigint, expected bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH manual AS (
    SELECT DISTINCT ON (a.student_id, a.sched_class_id, a.date)
      a.student_id, a.sched_class_id AS class_id, a.date, lower(a.status) AS status
    FROM attendance a
    WHERE a.sched_academic_year = p_academic_year
      AND a.sched_class_id IS NOT NULL
      AND a.date >= p_start_date AND a.date <= p_end_date
    ORDER BY a.student_id, a.sched_class_id, a.date, a.created_at DESC
  ),
  rfid AS (
    SELECT r.student_id, stu.class_id, r.date,
      CASE WHEN lower(r.status) = 'terlambat' THEN 'hadir' ELSE lower(r.status) END AS status
    FROM rfid_attendance r
    INNER JOIN students stu ON stu.id = r.student_id
    INNER JOIN classes c ON c.id = stu.class_id AND c.academic_year = p_academic_year
    WHERE r.date >= p_start_date AND r.date <= p_end_date
      AND NOT EXISTS (SELECT 1 FROM manual m WHERE m.student_id = r.student_id AND m.date = r.date)
  ),
  combined AS (
    SELECT class_id, date, status FROM manual
    UNION ALL
    SELECT class_id, date, status FROM rfid
  ),
  class_students AS (
    SELECT stu.class_id, count(*)::bigint AS n
    FROM students stu
    INNER JOIN classes c ON c.id = stu.class_id AND c.academic_year = p_academic_year
    WHERE stu.status = 'aktif' AND COALESCE(stu.is_alumni, false) = false
    GROUP BY stu.class_id
  ),
  agg AS (
    SELECT
      combined.class_id AS cid,
      count(DISTINCT combined.date)::bigint AS days,
      COUNT(*)::bigint AS recorded,
      COALESCE(SUM(CASE WHEN status = 'hadir' THEN 1 ELSE 0 END), 0)::bigint AS hadir,
      COALESCE(SUM(CASE WHEN status = 'izin' THEN 1 ELSE 0 END), 0)::bigint AS izin,
      COALESCE(SUM(CASE WHEN status = 'sakit' THEN 1 ELSE 0 END), 0)::bigint AS sakit,
      COALESCE(SUM(CASE WHEN status = 'alpa' THEN 1 ELSE 0 END), 0)::bigint AS alpa
    FROM combined
    GROUP BY combined.class_id
  )
  SELECT
    agg.cid,
    agg.hadir, agg.izin, agg.sakit, agg.alpa,
    GREATEST(COALESCE(cs.n, 0) * agg.days - agg.recorded, 0)::bigint AS belum,
    GREATEST(COALESCE(cs.n, 0) * agg.days, agg.recorded)::bigint AS expected
  FROM agg
  LEFT JOIN class_students cs ON cs.class_id = agg.cid;
$$;

-- ============================================================
-- Guru tetap bisa MELIHAT data yatim (jadwal sudah dihapus) miliknya
-- (policy tambahan, tidak mengubah policy yang sudah ada)
-- ============================================================
DROP POLICY IF EXISTS "Teachers view orphan attendance" ON public.attendance;
CREATE POLICY "Teachers view orphan attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (schedule_id IS NULL AND sched_teacher_id = auth.uid());

DROP POLICY IF EXISTS "Teachers view orphan journals" ON public.teaching_journals;
CREATE POLICY "Teachers view orphan journals" ON public.teaching_journals
  FOR SELECT TO authenticated
  USING (schedule_id IS NULL AND sched_teacher_id = auth.uid());

DROP POLICY IF EXISTS "Teachers view orphan grades" ON public.grades;
CREATE POLICY "Teachers view orphan grades" ON public.grades
  FOR SELECT TO authenticated
  USING (schedule_id IS NULL AND sched_teacher_id = auth.uid());
