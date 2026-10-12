-- Guru yang mengajar jam pertama tiap kelas pada tanggal tertentu (jadwal AKTIF, tahun ajaran & semester aktif).
-- SECURITY DEFINER agar kesiswaan/wali dapat melihatnya walau RLS membatasi tabel jadwal. Hanya mengembalikan nama.
CREATE OR REPLACE FUNCTION public.get_first_period_teachers(p_date date)
RETURNS TABLE (
  class_id uuid,
  class_name text,
  schedule_id uuid,
  teacher_name text,
  subject text,
  start_time time,
  end_time time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH st AS (
    SELECT academic_year, active_semester FROM public.school_settings LIMIT 1
  )
  SELECT DISTINCT ON (s.class_id)
    s.class_id, c.name, s.id, p.full_name, s.subject, s.start_time, s.end_time
  FROM public.schedules s
  CROSS JOIN st
  JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.teachers t ON t.id = s.teacher_id
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE s.is_active
    AND s.day_of_week = EXTRACT(ISODOW FROM p_date)::int
    AND s.academic_year = st.academic_year
    AND (st.active_semester IS NULL OR s.semester = st.active_semester)
  ORDER BY s.class_id, s.start_time, s.id;
$$;

REVOKE ALL ON FUNCTION public.get_first_period_teachers(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_first_period_teachers(date) TO authenticated, service_role;
