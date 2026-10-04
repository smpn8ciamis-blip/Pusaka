-- 1. allow system-generated attendance rows
ALTER TABLE public.attendance ALTER COLUMN created_by DROP NOT NULL;

-- 2. sync RFID taps into the main attendance table
CREATE OR REPLACE FUNCTION public.sync_rfid_to_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class uuid;
  v_sched uuid;
  v_status text;
  v_dow int;
BEGIN
  SELECT class_id INTO v_class FROM public.students WHERE id = NEW.student_id;
  IF v_class IS NULL THEN RETURN NEW; END IF;

  -- never override a manual entry made by a teacher
  IF EXISTS (
    SELECT 1 FROM public.attendance a
    WHERE a.student_id = NEW.student_id AND a.date = NEW.date
      AND COALESCE(a.notes, '') <> 'Absensi RFID'
  ) THEN
    RETURN NEW;
  END IF;

  v_status := CASE WHEN lower(NEW.status) = 'terlambat' THEN 'hadir' ELSE lower(NEW.status) END;
  v_dow := EXTRACT(dow FROM NEW.date)::int;

  SELECT s.id INTO v_sched
  FROM public.schedules s
  WHERE s.class_id = v_class AND s.day_of_week = v_dow
  ORDER BY s.start_time
  LIMIT 1;

  IF v_sched IS NULL THEN
    SELECT s.id INTO v_sched
    FROM public.schedules s
    WHERE s.class_id = v_class
    ORDER BY s.day_of_week, s.start_time
    LIMIT 1;
  END IF;

  IF v_sched IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.attendance (schedule_id, student_id, date, status, notes, school_id)
  VALUES (v_sched, NEW.student_id, NEW.date, v_status, 'Absensi RFID', NEW.school_id)
  ON CONFLICT (schedule_id, student_id, date)
  DO UPDATE SET status = EXCLUDED.status
  WHERE public.attendance.notes = 'Absensi RFID';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rfid_to_attendance ON public.rfid_attendance;
CREATE TRIGGER trg_sync_rfid_to_attendance
AFTER INSERT OR UPDATE OF status, check_in_at ON public.rfid_attendance
FOR EACH ROW EXECUTE FUNCTION public.sync_rfid_to_attendance();

-- 3. backfill existing RFID rows
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.rfid_attendance LOOP
    UPDATE public.rfid_attendance SET updated_at = now() WHERE id = r.id;
  END LOOP;
END $$;

-- 4. school-wide recap that accounts for students who have not been recorded
DROP FUNCTION IF EXISTS public.get_attendance_recap(date, date, text);
CREATE OR REPLACE FUNCTION public.get_attendance_recap(p_start_date date, p_end_date date, p_academic_year text)
RETURNS TABLE(total bigint, hadir bigint, izin bigint, sakit bigint, alpa bigint, belum bigint, expected bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH schedule_ids AS (
    SELECT id FROM schedules WHERE academic_year = p_academic_year
  ),
  manual AS (
    SELECT DISTINCT ON (a.student_id, a.date)
      a.student_id, a.date, lower(a.status) AS status
    FROM attendance a
    INNER JOIN schedule_ids s ON a.schedule_id = s.id
    WHERE a.date >= p_start_date AND a.date <= p_end_date
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

-- 5. per-class recap with expected/belum
DROP FUNCTION IF EXISTS public.get_attendance_by_class(date, date, text);
CREATE OR REPLACE FUNCTION public.get_attendance_by_class(p_start_date date, p_end_date date, p_academic_year text)
RETURNS TABLE(class_id uuid, hadir bigint, izin bigint, sakit bigint, alpa bigint, belum bigint, expected bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH schedule_class_map AS (
    SELECT id AS schedule_id, class_id FROM schedules WHERE academic_year = p_academic_year
  ),
  manual AS (
    SELECT DISTINCT ON (a.student_id, scm.class_id, a.date)
      a.student_id, scm.class_id, a.date, lower(a.status) AS status
    FROM attendance a
    INNER JOIN schedule_class_map scm ON a.schedule_id = scm.schedule_id
    WHERE a.date >= p_start_date AND a.date <= p_end_date
    ORDER BY a.student_id, scm.class_id, a.date, a.created_at DESC
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

-- 6. punctuality stats (tepat waktu vs terlambat) from RFID taps
CREATE OR REPLACE FUNCTION public.get_punctuality_stats(p_start_date date, p_end_date date, p_class_id uuid DEFAULT NULL)
RETURNS TABLE(date date, tepat_waktu bigint, terlambat bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT r.date,
    COALESCE(SUM(CASE WHEN lower(r.status) = 'hadir' THEN 1 ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN lower(r.status) = 'terlambat' THEN 1 ELSE 0 END), 0)::bigint
  FROM rfid_attendance r
  INNER JOIN students stu ON stu.id = r.student_id
  WHERE r.date >= p_start_date AND r.date <= p_end_date
    AND r.check_in_at IS NOT NULL
    AND (p_class_id IS NULL OR stu.class_id = p_class_id)
  GROUP BY r.date
  ORDER BY r.date;
$$;

GRANT EXECUTE ON FUNCTION public.get_punctuality_stats(date, date, uuid) TO authenticated, anon;