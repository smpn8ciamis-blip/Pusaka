-- Rekap absensi PER KELAS ke grup WhatsApp masing-masing kelas.
-- Setiap kelas dipetakan ke satu grup; bot mengirim jumlah hadir/sakit/izin/alfa + nama siswa yang tidak masuk.

CREATE TABLE IF NOT EXISTS public.wa_class_groups (
  class_id   uuid PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
  group_jid  text NOT NULL,
  group_name text,
  enabled    boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.wa_class_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage wa class groups" ON public.wa_class_groups;
CREATE POLICY "Admins manage wa class groups" ON public.wa_class_groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS class_group_recap_enabled boolean NOT NULL DEFAULT false;

-- Daftar siswa yang tidak masuk (sakit/izin/alpa) per kelas pada tanggal tertentu.
-- Memakai aturan yang sama dengan get_class_attendance_completion: angka diambil dari
-- jam paling awal yang sudah diabsen pada hari itu untuk kelas tersebut.
-- Berisi nama siswa, jadi HANYA service_role (bot) yang boleh memanggil.
CREATE OR REPLACE FUNCTION public.get_class_absent_students(p_date date)
RETURNS TABLE (
  class_id   uuid,
  student_id uuid,
  full_name  text,
  status     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH att AS (
    SELECT a.student_id, a.status,
           COALESCE(a.sched_class_id, s.class_id)     AS cid,
           COALESCE(a.sched_start_time, s.start_time) AS stt
    FROM public.attendance a
    LEFT JOIN public.schedules s ON s.id = a.schedule_id
    WHERE a.date = p_date
  ),
  first_att AS (
    SELECT cid, min(stt) AS stt FROM att WHERE cid IS NOT NULL GROUP BY cid
  )
  SELECT r.cid, st.id, st.full_name, r.status
  FROM att r
  JOIN first_att fa ON fa.cid = r.cid AND r.stt IS NOT DISTINCT FROM fa.stt
  JOIN public.students st ON st.id = r.student_id
  WHERE r.status IN ('sakit', 'izin', 'alpa')
  ORDER BY r.cid,
           CASE r.status WHEN 'sakit' THEN 1 WHEN 'izin' THEN 2 ELSE 3 END,
           st.full_name;
$$;

REVOKE ALL ON FUNCTION public.get_class_absent_students(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_absent_students(date) TO service_role;
