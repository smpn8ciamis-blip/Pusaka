-- Rekap uji coba ke grup WhatsApp: ambil dari data absensi TERAKHIR yang tercatat,
-- tidak bergantung pada jadwal aktif / hari ini. Memakai snapshot kelas & jam di tabel attendance
-- (tetap benar walau jadwal sudah dinonaktifkan atau dihapus).
CREATE OR REPLACE FUNCTION public.get_last_class_attendance_recap()
RETURNS TABLE (
  recap_date date,
  class_id uuid,
  class_name text,
  total_students integer,
  hadir integer,
  sakit integer,
  izin integer,
  alpa integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_d AS (
    SELECT max(date) AS d FROM public.attendance
  ),
  rec AS (
    SELECT a.id, a.status,
           COALESCE(a.sched_class_id, s.class_id) AS cid,
           COALESCE(a.sched_start_time, s.start_time) AS st
    FROM public.attendance a
    LEFT JOIN public.schedules s ON s.id = a.schedule_id
    CROSS JOIN last_d
    WHERE a.date = last_d.d
  ),
  first_period AS (
    -- hanya jam pertama tiap kelas (jam paling awal yang diabsen pada tanggal tsb)
    SELECT cid, min(st) AS st FROM rec WHERE cid IS NOT NULL GROUP BY cid
  )
  SELECT
    (SELECT d FROM last_d),
    c.id,
    c.name,
    (SELECT count(*) FROM public.students x
       WHERE x.class_id = c.id AND x.status = 'aktif' AND x.is_alumni = false)::int,
    (count(r.id) FILTER (WHERE r.status = 'hadir'))::int,
    (count(r.id) FILTER (WHERE r.status = 'sakit'))::int,
    (count(r.id) FILTER (WHERE r.status = 'izin'))::int,
    (count(r.id) FILTER (WHERE r.status = 'alpa'))::int
  FROM first_period f
  JOIN public.classes c ON c.id = f.cid
  JOIN rec r ON r.cid = f.cid AND r.st IS NOT DISTINCT FROM f.st
  GROUP BY c.id, c.name
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.get_last_class_attendance_recap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_last_class_attendance_recap() TO authenticated, service_role;
