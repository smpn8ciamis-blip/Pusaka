-- Perbaikan kelengkapan absensi (pemicu rekap grup WA):
-- sebelumnya sebuah kelas dianggap "sudah terabsen" HANYA bila absen JAM PERTAMA JADWAL terisi.
-- Akibatnya rekap tidak terkirim bila guru jam pertama tidak mengisi tetapi jam lain sudah (dashboard
-- kesiswaan menganggapnya sudah absen). Sekarang: kelas terisi bila ada absensi apa pun pada tanggal tsb,
-- dan angka rekap diambil dari jam paling awal yang sudah diabsen. Kelas yang diharapkan = kelas dengan
-- jadwal aktif pada hari itu + kelas yang sudah punya absensi (kelas dari snapshot, tetap benar walau jadwal dihapus).
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
  sched AS (
    SELECT s.id, s.class_id, s.start_time
    FROM public.schedules s
    CROSS JOIN st
    WHERE s.is_active
      AND s.day_of_week = EXTRACT(ISODOW FROM p_date)::int
      AND s.academic_year = st.academic_year
      AND (st.active_semester IS NULL OR s.semester = st.active_semester)
  ),
  first_s AS (
    SELECT DISTINCT ON (class_id) class_id, id AS schedule_id
    FROM sched
    ORDER BY class_id, start_time, id
  ),
  att AS (
    SELECT a.id, a.status,
           COALESCE(a.sched_class_id, s.class_id) AS cid,
           COALESCE(a.sched_start_time, s.start_time) AS stt
    FROM public.attendance a
    LEFT JOIN public.schedules s ON s.id = a.schedule_id
    WHERE a.date = p_date
  ),
  first_att AS (
    SELECT cid, min(stt) AS stt FROM att WHERE cid IS NOT NULL GROUP BY cid
  ),
  expected AS (
    SELECT class_id AS cid FROM sched
    UNION
    SELECT cid FROM att WHERE cid IS NOT NULL
  )
  SELECT
    c.id,
    c.name,
    fs.schedule_id,
    (SELECT count(*) FROM public.students x
       WHERE x.class_id = c.id AND x.status = 'aktif' AND COALESCE(x.is_alumni, false) = false)::int,
    (count(r.id) FILTER (WHERE r.status = 'hadir'))::int,
    (count(r.id) FILTER (WHERE r.status = 'sakit'))::int,
    (count(r.id) FILTER (WHERE r.status = 'izin'))::int,
    (count(r.id) FILTER (WHERE r.status = 'alpa'))::int,
    count(r.id) > 0
  FROM expected e
  JOIN public.classes c ON c.id = e.cid
  LEFT JOIN first_s fs ON fs.class_id = c.id
  LEFT JOIN first_att fa ON fa.cid = c.id
  LEFT JOIN att r ON r.cid = c.id AND r.stt IS NOT DISTINCT FROM fa.stt
  GROUP BY c.id, c.name, fs.schedule_id
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.get_class_attendance_completion(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_attendance_completion(date) TO authenticated, service_role;
