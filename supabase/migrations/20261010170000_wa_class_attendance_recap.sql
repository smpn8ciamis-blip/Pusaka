-- Rekap absensi per kelas ke grup WhatsApp, dipicu frontend saat absen semua kelas lengkap
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS class_recap_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS class_recap_group_jid text,
  ADD COLUMN IF NOT EXISTS class_recap_group_name text;

-- Status absen jam pertama tiap kelas yang punya jadwal aktif pada tanggal tsb.
-- SECURITY DEFINER agar guru/wali kelas bisa tahu "apakah semua kelas sudah terabsen"
-- walau RLS hanya mengizinkan melihat kelasnya sendiri. Hanya mengembalikan angka rekap.
CREATE OR REPLACE FUNCTION public.get_class_attendance_completion(p_date date)
RETURNS TABLE (
  class_id uuid,
  class_name text,
  first_schedule_id uuid,
  total_students integer,
  hadir integer,
  sakit integer,
  izin integer,
  alpa integer,
  filled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH st AS (
    SELECT academic_year, active_semester FROM public.school_settings LIMIT 1
  ),
  first_s AS (
    SELECT DISTINCT ON (s.class_id) s.class_id, s.id AS schedule_id
    FROM public.schedules s
    CROSS JOIN st
    WHERE s.is_active
      AND s.day_of_week = EXTRACT(ISODOW FROM p_date)::int
      AND s.academic_year = st.academic_year
      AND (st.active_semester IS NULL OR s.semester = st.active_semester)
    ORDER BY s.class_id, s.start_time, s.id
  )
  SELECT
    c.id,
    c.name,
    f.schedule_id,
    (SELECT count(*) FROM public.students x
       WHERE x.class_id = c.id AND x.status = 'aktif' AND x.is_alumni = false)::int,
    (count(a.id) FILTER (WHERE a.status = 'hadir'))::int,
    (count(a.id) FILTER (WHERE a.status = 'sakit'))::int,
    (count(a.id) FILTER (WHERE a.status = 'izin'))::int,
    (count(a.id) FILTER (WHERE a.status = 'alpa'))::int,
    count(a.id) > 0
  FROM first_s f
  JOIN public.classes c ON c.id = f.class_id
  LEFT JOIN public.attendance a ON a.schedule_id = f.schedule_id AND a.date = p_date
  GROUP BY c.id, c.name, f.schedule_id
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.get_class_attendance_completion(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_attendance_completion(date) TO authenticated, service_role;
