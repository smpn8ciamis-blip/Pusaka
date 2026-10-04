
-- Fix get_attendance_recap to filter by school_id using SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.get_attendance_recap(
  p_start_date DATE,
  p_end_date DATE,
  p_academic_year TEXT
)
RETURNS TABLE(total BIGINT, hadir BIGINT, izin BIGINT, sakit BIGINT, alpa BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH schedule_ids AS (
    SELECT id FROM schedules WHERE academic_year = p_academic_year
  ),
  deduped AS (
    SELECT DISTINCT ON (a.student_id, a.date) 
      a.status
    FROM attendance a
    INNER JOIN schedule_ids s ON a.schedule_id = s.id
    WHERE a.date >= p_start_date
      AND a.date <= p_end_date
    ORDER BY a.student_id, a.date, a.created_at DESC
  )
  SELECT 
    COUNT(*)::BIGINT AS total,
    COALESCE(SUM(CASE WHEN LOWER(status) = 'hadir' THEN 1 ELSE 0 END), 0)::BIGINT AS hadir,
    COALESCE(SUM(CASE WHEN LOWER(status) = 'izin' THEN 1 ELSE 0 END), 0)::BIGINT AS izin,
    COALESCE(SUM(CASE WHEN LOWER(status) = 'sakit' THEN 1 ELSE 0 END), 0)::BIGINT AS sakit,
    COALESCE(SUM(CASE WHEN LOWER(status) = 'alpa' THEN 1 ELSE 0 END), 0)::BIGINT AS alpa
  FROM deduped;
$$;

-- Fix get_attendance_by_class to filter by school_id using SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.get_attendance_by_class(
  p_start_date DATE,
  p_end_date DATE,
  p_academic_year TEXT
)
RETURNS TABLE(class_id UUID, hadir BIGINT, izin BIGINT, sakit BIGINT, alpa BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH schedule_class_map AS (
    SELECT id AS schedule_id, class_id 
    FROM schedules 
    WHERE academic_year = p_academic_year
  ),
  deduped AS (
    SELECT DISTINCT ON (a.student_id, scm.class_id, a.date) 
      scm.class_id,
      a.status
    FROM attendance a
    INNER JOIN schedule_class_map scm ON a.schedule_id = scm.schedule_id
    WHERE a.date >= p_start_date
      AND a.date <= p_end_date
    ORDER BY a.student_id, scm.class_id, a.date, a.created_at DESC
  )
  SELECT 
    deduped.class_id,
    COALESCE(SUM(CASE WHEN LOWER(status) = 'hadir' THEN 1 ELSE 0 END), 0)::BIGINT AS hadir,
    COALESCE(SUM(CASE WHEN LOWER(status) = 'izin' THEN 1 ELSE 0 END), 0)::BIGINT AS izin,
    COALESCE(SUM(CASE WHEN LOWER(status) = 'sakit' THEN 1 ELSE 0 END), 0)::BIGINT AS sakit,
    COALESCE(SUM(CASE WHEN LOWER(status) = 'alpa' THEN 1 ELSE 0 END), 0)::BIGINT AS alpa
  FROM deduped
  GROUP BY deduped.class_id;
$$;
