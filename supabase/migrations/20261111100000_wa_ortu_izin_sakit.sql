-- =====================================================================
-- Izin / sakit siswa dilaporkan orang tua lewat WhatsApp, disetujui wali kelas.
--
-- Alur: ortu (nomor tertaut) ketik "sakit"/"izin" -> bot tanya tanggal -> bot minta foto surat -> pemberitahuan
-- masuk ke tabel student_absence_notices (status 'menunggu') dan dikirim ke wali kelas. Wali kelas ACC/TOLAK
-- lewat WhatsApp atau aplikasi (halaman Akun Siswa). ACC: absensi siswa pada tanggal itu disimpan
-- (status sakit/izin) di semua jam pelajaran kelasnya. TOLAK: absensi tidak berubah.
-- Berkas surat disimpan di bucket privat 'absence-notices'; terlihat oleh wali kelas siswa, admin, kesiswaan.
-- Aman dijalankan ulang.
-- =====================================================================

-- 1. Tanda baris absensi yang berasal dari persetujuan izin/sakit ortu
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS parent_notice_id uuid;
CREATE INDEX IF NOT EXISTS idx_attendance_parent_notice ON public.attendance (parent_notice_id) WHERE parent_notice_id IS NOT NULL;

-- 2. Tabel pemberitahuan
CREATE TABLE IF NOT EXISTS public.student_absence_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('sakit', 'izin')),
  absence_date date NOT NULL,
  short_code text NOT NULL,
  file_path text,
  file_name text,
  mime_type text,
  file_size integer,
  parent_phone text,
  parent_jid text,
  homeroom_user_id uuid,
  homeroom_jid text,
  homeroom_wa_message_id text,
  status text NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'ditolak')),
  decided_by uuid,
  decided_at timestamptz,
  decided_via text,
  decision_note text,
  applied_rows integer,
  parent_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_absence_notices_student ON public.student_absence_notices (student_id, absence_date DESC);
CREATE INDEX IF NOT EXISTS idx_absence_notices_class_status ON public.student_absence_notices (class_id, status);
CREATE INDEX IF NOT EXISTS idx_absence_notices_created ON public.student_absence_notices (created_at DESC);
-- satu pemberitahuan aktif (menunggu/disetujui) per siswa per tanggal
CREATE UNIQUE INDEX IF NOT EXISTS uq_absence_notice_active ON public.student_absence_notices (student_id, absence_date) WHERE status IN ('menunggu', 'disetujui');
-- kode pendek untuk balasan wali kelas ("ACC K7M2") unik selama masih menunggu
CREATE UNIQUE INDEX IF NOT EXISTS uq_absence_notice_code_pending ON public.student_absence_notices (short_code) WHERE status = 'menunggu';

ALTER TABLE public.student_absence_notices ENABLE ROW LEVEL SECURITY;

-- Wali kelas dari kelas siswa tsb (kelas tempat siswa saat pemberitahuan dibuat)
CREATE OR REPLACE FUNCTION public.is_homeroom_of_class(p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_class IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.classes c JOIN public.teachers t ON t.id = c.homeroom_teacher_id
    WHERE c.id = p_class AND t.user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.is_homeroom_of_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_homeroom_of_class(uuid) TO authenticated;

DROP POLICY IF EXISTS "Lihat izin sakit siswa" ON public.student_absence_notices;
CREATE POLICY "Lihat izin sakit siswa" ON public.student_absence_notices
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (school_id IS NOT DISTINCT FROM public.get_user_school_id()
        AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan')
             OR public.is_homeroom_of_class(class_id)))
  );
-- Tidak ada kebijakan INSERT/UPDATE/DELETE: perubahan hanya lewat bot (service role) dan RPC di bawah.

-- 3. Bucket privat untuk foto surat
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('absence-notices', 'absence-notices', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Berkas boleh dibaca (signed URL) hanya oleh yang boleh melihat pemberitahuannya (RLS tabel berlaku di subquery)
DROP POLICY IF EXISTS "absence_notices_select" ON storage.objects;
CREATE POLICY "absence_notices_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'absence-notices'
         AND EXISTS (SELECT 1 FROM public.student_absence_notices n WHERE n.file_path = storage.objects.name));

-- 4. Jumlah jam pelajaran kelas pada suatu tanggal (dipakai bot untuk memeriksa tanggal yang dipilih ortu)
CREATE OR REPLACE FUNCTION public.absence_notice_schedule_count(p_class uuid, p_date date)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int
  FROM public.schedules s
  CROSS JOIN (SELECT academic_year, active_semester FROM public.school_settings LIMIT 1) st
  WHERE s.class_id = p_class AND s.is_active
    AND s.day_of_week = EXTRACT(ISODOW FROM p_date)::int
    AND s.academic_year = st.academic_year
    AND (st.active_semester IS NULL OR s.semester = st.active_semester)
$$;
REVOKE ALL ON FUNCTION public.absence_notice_schedule_count(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.absence_notice_schedule_count(uuid, date) TO service_role;

-- 5. Menerapkan keputusan (inti). Dipanggil bot (service role, wali kelas sudah dikenali dari nomornya)
--    dan oleh decide_absence_notice (aplikasi, otorisasi diperiksa di sana).
CREATE OR REPLACE FUNCTION public.absence_notice_apply(p_id uuid, p_approve boolean, p_by uuid, p_via text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n public.student_absence_notices%ROWTYPE;
  v_rows integer := 0;
  v_skipped integer := 0;
  v_total integer := 0;
BEGIN
  SELECT * INTO n FROM public.student_absence_notices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'tidak_ditemukan'); END IF;
  IF n.status <> 'menunggu' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sudah_diputuskan', 'status', n.status);
  END IF;

  IF p_approve THEN
    WITH sched AS (
      SELECT s.id
      FROM public.schedules s
      CROSS JOIN (SELECT academic_year, active_semester FROM public.school_settings LIMIT 1) st
      WHERE s.class_id = n.class_id AND s.is_active
        AND s.day_of_week = EXTRACT(ISODOW FROM n.absence_date)::int
        AND s.academic_year = st.academic_year
        AND (st.active_semester IS NULL OR s.semester = st.active_semester)
    )
    SELECT count(*) INTO v_total FROM sched;
    IF v_total = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'tidak_ada_jadwal');
    END IF;

    -- Satu baris per jam pelajaran. Baris yang sudah berisi hadir/terlambat tidak diubah (siswa ternyata masuk);
    -- baris alpa/izin/sakit diganti sesuai pemberitahuan. copy_detached = true agar tidak disalin ulang oleh trigger penyebar.
    WITH sched AS (
      SELECT s.id
      FROM public.schedules s
      CROSS JOIN (SELECT academic_year, active_semester FROM public.school_settings LIMIT 1) st
      WHERE s.class_id = n.class_id AND s.is_active
        AND s.day_of_week = EXTRACT(ISODOW FROM n.absence_date)::int
        AND s.academic_year = st.academic_year
        AND (st.active_semester IS NULL OR s.semester = st.active_semester)
    ), ins AS (
      INSERT INTO public.attendance (schedule_id, student_id, date, status, notes, created_by, school_id, copy_detached, parent_notice_id)
      SELECT sc.id, n.student_id, n.absence_date, n.kind,
             CASE n.kind WHEN 'sakit' THEN 'Sakit' ELSE 'Izin' END || ' (diberitahukan orang tua via WhatsApp, disetujui wali kelas)',
             p_by, n.school_id, true, n.id
      FROM sched sc
      ON CONFLICT (schedule_id, student_id, date) DO UPDATE
        SET status = EXCLUDED.status, notes = EXCLUDED.notes, parent_notice_id = EXCLUDED.parent_notice_id
        WHERE public.attendance.status IN ('alpa', 'izin', 'sakit')
      RETURNING 1
    )
    SELECT count(*) INTO v_rows FROM ins;
    v_skipped := v_total - v_rows;
  END IF;

  UPDATE public.student_absence_notices
     SET status = CASE WHEN p_approve THEN 'disetujui' ELSE 'ditolak' END,
         decided_by = p_by, decided_at = now(), decided_via = p_via,
         decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
         applied_rows = CASE WHEN p_approve THEN v_rows ELSE NULL END,
         updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_approve THEN 'disetujui' ELSE 'ditolak' END,
                            'rows', v_rows, 'skipped', v_skipped);
END $$;
REVOKE ALL ON FUNCTION public.absence_notice_apply(uuid, boolean, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.absence_notice_apply(uuid, boolean, uuid, text, text) TO service_role;

-- 6. Dipanggil aplikasi: wali kelas siswa, admin, kesiswaan (satu sekolah)
CREATE OR REPLACE FUNCTION public.decide_absence_notice(p_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n public.student_absence_notices%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus login' USING ERRCODE = '42501'; END IF;
  SELECT * INTO n FROM public.student_absence_notices WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'tidak_ditemukan'); END IF;
  IF NOT (public.is_super_admin()
          OR (n.school_id IS NOT DISTINCT FROM public.get_user_school_id()
              AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'kesiswaan')
                   OR public.is_homeroom_of_class(n.class_id)))) THEN
    RAISE EXCEPTION 'Tidak berwenang memutuskan pemberitahuan ini' USING ERRCODE = '42501';
  END IF;
  RETURN public.absence_notice_apply(p_id, p_approve, auth.uid(), 'app', p_note);
END $$;
REVOKE ALL ON FUNCTION public.decide_absence_notice(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_absence_notice(uuid, boolean, text) TO authenticated;

-- 7. Saklar bot
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS parent_absence_wa_enabled boolean NOT NULL DEFAULT true;

-- 8. Rekap "kelas sudah mengisi absensi" tidak menghitung baris dari izin/sakit ortu
--    (kalau dihitung, satu izin yang disetujui sebelum guru mengabsen membuat kelas dianggap sudah mengisi).
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
      AND a.parent_notice_id IS NULL   -- absensi dari izin/sakit ortu tidak dihitung sebagai 'kelas sudah mengisi absensi'
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

NOTIFY pgrst, 'reload schema';
