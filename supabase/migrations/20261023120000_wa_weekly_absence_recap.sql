-- Rekap mingguan siswa tidak hadir (sakit / izin / alfa) lewat WhatsApp
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS weekly_absence_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_absence_day integer NOT NULL DEFAULT 6,          -- 1=Senin ... 7=Minggu
  ADD COLUMN IF NOT EXISTS weekly_absence_time text NOT NULL DEFAULT '13:00',
  ADD COLUMN IF NOT EXISTS weekly_absence_threshold integer NOT NULL DEFAULT 3,    -- "sering": total hari tidak hadir >= nilai ini (atau alfa >= 2)
  ADD COLUMN IF NOT EXISTS weekly_absence_to_group boolean NOT NULL DEFAULT false; -- kirim juga ringkasan sekolah ke grup rekap

ALTER TABLE public.wa_bot_settings DROP CONSTRAINT IF EXISTS wa_bot_settings_weekly_absence_day_check;
ALTER TABLE public.wa_bot_settings
  ADD CONSTRAINT wa_bot_settings_weekly_absence_day_check CHECK (weekly_absence_day BETWEEN 1 AND 7);

-- Jumlah hari tidak hadir per siswa pada rentang tanggal. Status harian siswa = status pada
-- absensi JAM PERTAMA kelasnya hari itu (sama dengan "absensi kelas" di rekap harian).
-- Hanya untuk bot (service_role): berisi data pribadi siswa.
CREATE OR REPLACE FUNCTION public.get_weekly_absence_recap(p_from date, p_to date)
RETURNS TABLE (
  class_id uuid,
  class_name text,
  student_id uuid,
  student_name text,
  sakit integer,
  izin integer,
  alpa integer,
  total integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH st AS (
    SELECT academic_year, active_semester FROM public.school_settings LIMIT 1
  ),
  days AS (
    SELECT d::date AS day, EXTRACT(ISODOW FROM d)::int AS dow
    FROM generate_series(p_from, p_to, interval '1 day') d
  ),
  first_s AS (
    SELECT DISTINCT ON (s.class_id, dd.day) s.class_id, dd.day, s.id AS schedule_id
    FROM days dd
    JOIN public.schedules s ON s.day_of_week = dd.dow
    CROSS JOIN st
    WHERE s.is_active
      AND s.academic_year = st.academic_year
      AND (st.active_semester IS NULL OR s.semester = st.active_semester)
    ORDER BY s.class_id, dd.day, s.start_time, s.id
  )
  SELECT
    c.id, c.name, stu.id, stu.full_name,
    (count(*) FILTER (WHERE a.status = 'sakit'))::int,
    (count(*) FILTER (WHERE a.status = 'izin'))::int,
    (count(*) FILTER (WHERE a.status = 'alpa'))::int,
    count(*)::int
  FROM first_s f
  JOIN public.attendance a ON a.schedule_id = f.schedule_id AND a.date = f.day
  JOIN public.students stu ON stu.id = a.student_id AND stu.class_id = f.class_id
                          AND stu.status = 'aktif' AND stu.is_alumni = false
  JOIN public.classes c ON c.id = f.class_id
  WHERE a.status IN ('sakit', 'izin', 'alpa')
  GROUP BY c.id, c.name, stu.id, stu.full_name
  ORDER BY c.name, 7 DESC, 8 DESC, stu.full_name
$$;

REVOKE ALL ON FUNCTION public.get_weekly_absence_recap(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_absence_recap(date, date) TO service_role;
