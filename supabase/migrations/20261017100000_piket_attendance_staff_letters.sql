-- =====================================================================================
-- 1) Surat tugas untuk STAF + bukti kunjungan oleh staf
-- 2) Pengelolaan PIKET MALAM & PIKET SABTU-MINGGU dengan daftar hadir dari FINGERPRINT
-- Prasyarat: migrasi 20261017060000 (role staf) & 20261017060100 (tabel staff) sudah dijalankan.
-- =====================================================================================

-- ---------- Helper (SECURITY DEFINER: menghindari rekursi RLS antar tabel) ----------
CREATE OR REPLACE FUNCTION public.my_staff_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_teacher_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.teachers WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_piket_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'bendahara') OR public.is_super_admin()
$$;

GRANT EXECUTE ON FUNCTION public.my_staff_id(), public.my_teacher_id(), public.is_piket_manager() TO authenticated;

-- ---------- 1. Surat tugas untuk staf ----------
-- Staf ditautkan sebagai "pelaksana manual" (sehingga cetak surat tugas yang ada tetap bekerja).
ALTER TABLE public.assignment_letter_manual_executors
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_alme_staff ON public.assignment_letter_manual_executors(staff_id) WHERE staff_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_my_staff_letter(_letter uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignment_letter_manual_executors me
    WHERE me.assignment_letter_id = _letter AND me.staff_id IS NOT NULL AND me.staff_id = public.my_staff_id()
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_my_staff_letter(uuid) TO authenticated;

DROP POLICY IF EXISTS "staf_view_own_assignment_letters" ON public.assignment_letters;
CREATE POLICY "staf_view_own_assignment_letters" ON public.assignment_letters
  FOR SELECT TO authenticated USING (public.is_my_staff_letter(id));

DROP POLICY IF EXISTS "staf_view_own_manual_executors" ON public.assignment_letter_manual_executors;
CREATE POLICY "staf_view_own_manual_executors" ON public.assignment_letter_manual_executors
  FOR SELECT TO authenticated USING (staff_id IS NOT NULL AND staff_id = public.my_staff_id());

-- Lampiran bukti kunjungan: boleh dimiliki guru ATAU staf
ALTER TABLE public.letter_attachments ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE;
ALTER TABLE public.letter_attachments ALTER COLUMN teacher_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_letter_attachments_staff ON public.letter_attachments(staff_id) WHERE staff_id IS NOT NULL;

DROP POLICY IF EXISTS "staf_select_own_attachments" ON public.letter_attachments;
CREATE POLICY "staf_select_own_attachments" ON public.letter_attachments
  FOR SELECT TO authenticated USING (staff_id IS NOT NULL AND staff_id = public.my_staff_id());

DROP POLICY IF EXISTS "staf_insert_own_attachments" ON public.letter_attachments;
CREATE POLICY "staf_insert_own_attachments" ON public.letter_attachments
  FOR INSERT TO authenticated WITH CHECK (
    staff_id IS NOT NULL AND staff_id = public.my_staff_id()
    AND letter_type = 'assignment' AND public.is_my_staff_letter(assignment_letter_id)
  );

DROP POLICY IF EXISTS "staf_delete_own_attachments" ON public.letter_attachments;
CREATE POLICY "staf_delete_own_attachments" ON public.letter_attachments
  FOR DELETE TO authenticated USING (staff_id IS NOT NULL AND staff_id = public.my_staff_id());

DROP POLICY IF EXISTS "admin_all_letter_attachments" ON public.letter_attachments;
CREATE POLICY "admin_all_letter_attachments" ON public.letter_attachments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());

-- Storage bucket lampiran: staf mengelola berkas di folder miliknya sendiri
DROP POLICY IF EXISTS "staf_letter_attachments_insert" ON storage.objects;
CREATE POLICY "staf_letter_attachments_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'letter-attachments' AND (storage.foldername(name))[1] = auth.uid()::text
              AND public.has_role(auth.uid(),'staf'));
DROP POLICY IF EXISTS "staf_letter_attachments_select" ON storage.objects;
CREATE POLICY "staf_letter_attachments_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'letter-attachments' AND (storage.foldername(name))[1] = auth.uid()::text
         AND public.has_role(auth.uid(),'staf'));
DROP POLICY IF EXISTS "staf_letter_attachments_delete" ON storage.objects;
CREATE POLICY "staf_letter_attachments_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'letter-attachments' AND (storage.foldername(name))[1] = auth.uid()::text
         AND public.has_role(auth.uid(),'staf'));

-- ---------- 2. Piket ----------
CREATE TABLE IF NOT EXISTS public.piket_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  night_window_start time NOT NULL DEFAULT '16:00',   -- piket malam tanggal D: mulai D jam ini ...
  night_window_end   time NOT NULL DEFAULT '09:00',   -- ... sampai D+1 jam ini
  weekend_window_start time NOT NULL DEFAULT '05:00', -- piket sabtu/minggu: jendela di hari yang sama
  weekend_window_end   time NOT NULL DEFAULT '20:00',
  min_gap_minutes integer NOT NULL DEFAULT 60         -- tap terakhir dianggap pulang bila >= x menit setelah datang
);
INSERT INTO public.piket_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.piket_duties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id),
  shift_type text NOT NULL CHECK (shift_type IN ('malam','sabtu_minggu')),
  duty_date date NOT NULL,
  person_type text NOT NULL CHECK (person_type IN ('staff','teacher','manual')),
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  person_name text NOT NULL,
  position text,
  fingerprint_pin text,
  status text NOT NULL DEFAULT 'dijadwalkan' CHECK (status IN ('dijadwalkan','hadir','tidak_hadir','izin')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  source text NOT NULL DEFAULT 'fingerprint' CHECK (source IN ('fingerprint','manual')),
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS piket_duties_unique
  ON public.piket_duties (COALESCE(school_id::text,''), shift_type, duty_date, (COALESCE(staff_id::text, teacher_id::text, lower(person_name))));
CREATE INDEX IF NOT EXISTS idx_piket_duties_date ON public.piket_duties(shift_type, duty_date);
CREATE INDEX IF NOT EXISTS idx_piket_duties_pin ON public.piket_duties(fingerprint_pin) WHERE fingerprint_pin IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.piket_duties, public.piket_settings TO authenticated;
GRANT ALL ON public.piket_duties, public.piket_settings TO service_role;
ALTER TABLE public.piket_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piket_settings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS auto_set_school_id_piket_duties ON public.piket_duties;
CREATE TRIGGER auto_set_school_id_piket_duties BEFORE INSERT ON public.piket_duties
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

-- PIN diambil otomatis dari data staf/guru bila tidak diisi; updated_at dijaga
CREATE OR REPLACE FUNCTION public.piket_duties_before_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fingerprint_pin IS NULL OR NEW.fingerprint_pin = '' THEN
    IF NEW.staff_id IS NOT NULL THEN
      SELECT fingerprint_pin INTO NEW.fingerprint_pin FROM public.staff WHERE id = NEW.staff_id;
    ELSIF NEW.teacher_id IS NOT NULL THEN
      SELECT fingerprint_pin INTO NEW.fingerprint_pin FROM public.teachers WHERE id = NEW.teacher_id;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS piket_duties_bw ON public.piket_duties;
CREATE TRIGGER piket_duties_bw BEFORE INSERT OR UPDATE ON public.piket_duties
  FOR EACH ROW EXECUTE FUNCTION public.piket_duties_before_write();

DROP POLICY IF EXISTS "school_isolation_piket_duties" ON public.piket_duties;
CREATE POLICY "school_isolation_piket_duties" ON public.piket_duties AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "piket_duties_manage" ON public.piket_duties;
CREATE POLICY "piket_duties_manage" ON public.piket_duties FOR ALL TO authenticated
  USING (public.is_piket_manager()) WITH CHECK (public.is_piket_manager());

DROP POLICY IF EXISTS "piket_duties_read_office" ON public.piket_duties;
CREATE POLICY "piket_duties_read_office" ON public.piket_duties FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'tata_usaha'));

DROP POLICY IF EXISTS "piket_duties_read_own" ON public.piket_duties;
CREATE POLICY "piket_duties_read_own" ON public.piket_duties FOR SELECT TO authenticated
  USING ((staff_id IS NOT NULL AND staff_id = public.my_staff_id())
      OR (teacher_id IS NOT NULL AND teacher_id = public.my_teacher_id()));

DROP POLICY IF EXISTS "piket_settings_read" ON public.piket_settings;
CREATE POLICY "piket_settings_read" ON public.piket_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "piket_settings_manage" ON public.piket_settings;
CREATE POLICY "piket_settings_manage" ON public.piket_settings FOR ALL TO authenticated
  USING (public.is_piket_manager()) WITH CHECK (public.is_piket_manager());

-- Hitung ulang satu baris piket dari log fingerprint (kecuali baris yang sudah diubah manual)
CREATE OR REPLACE FUNCTION public._piket_recalc(_duty uuid, _force boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record; s record; w_start timestamptz; w_end timestamptz; v_pin text; ci timestamptz; co timestamptz;
BEGIN
  SELECT * INTO d FROM public.piket_duties WHERE id = _duty;
  IF NOT FOUND THEN RETURN false; END IF;
  IF d.source = 'manual' AND NOT _force THEN RETURN false; END IF;
  SELECT * INTO s FROM public.piket_settings WHERE id = 1;

  v_pin := COALESCE(NULLIF(d.fingerprint_pin,''),
                  (SELECT fingerprint_pin FROM public.staff WHERE id = d.staff_id),
                  (SELECT fingerprint_pin FROM public.teachers WHERE id = d.teacher_id));
  IF v_pin IS NULL OR v_pin = '' THEN RETURN false; END IF;

  IF d.shift_type = 'malam' THEN
    w_start := ((d.duty_date + s.night_window_start) AT TIME ZONE 'Asia/Jakarta');
    w_end   := (((d.duty_date + 1) + s.night_window_end) AT TIME ZONE 'Asia/Jakarta');
  ELSE
    w_start := ((d.duty_date + s.weekend_window_start) AT TIME ZONE 'Asia/Jakarta');
    w_end   := ((d.duty_date + s.weekend_window_end) AT TIME ZONE 'Asia/Jakarta');
  END IF;

  SELECT min(punched_at), max(punched_at) INTO ci, co
  FROM public.fingerprint_logs WHERE fingerprint_logs.pin = v_pin AND punched_at BETWEEN w_start AND w_end;

  IF ci IS NULL THEN
    IF _force THEN
      UPDATE public.piket_duties SET check_in_at = NULL, check_out_at = NULL, status = 'dijadwalkan', source = 'fingerprint' WHERE id = d.id;
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  UPDATE public.piket_duties
     SET check_in_at = ci,
         check_out_at = CASE WHEN co >= ci + make_interval(mins => s.min_gap_minutes) THEN co ELSE NULL END,
         status = 'hadir', source = 'fingerprint'
   WHERE id = d.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._piket_recalc(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Tarik/hitung ulang kehadiran dari fingerprint untuk rentang tanggal (admin / bendahara)
CREATE OR REPLACE FUNCTION public.piket_sync(p_from date, p_to date, p_shift text DEFAULT NULL, p_reset_manual boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0; school uuid := public.get_user_school_id();
BEGIN
  IF NOT public.is_piket_manager() THEN RAISE EXCEPTION 'Hanya admin atau bendahara yang dapat menarik data fingerprint'; END IF;
  FOR r IN
    SELECT id FROM public.piket_duties
    WHERE duty_date BETWEEN p_from AND p_to
      AND (p_shift IS NULL OR shift_type = p_shift)
      AND (public.is_super_admin() OR school_id IS NOT DISTINCT FROM school)
  LOOP
    IF public._piket_recalc(r.id, p_reset_manual) THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.piket_sync(date, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piket_sync(date, date, text, boolean) TO authenticated;

-- Real-time: setiap ketukan jari baru langsung memperbarui piket yang cocok (tidak boleh menggagalkan absensi)
CREATE OR REPLACE FUNCTION public.piket_on_punch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; jd date := (NEW.punched_at AT TIME ZONE 'Asia/Jakarta')::date;
BEGIN
  FOR r IN
    SELECT d.id FROM public.piket_duties d
    LEFT JOIN public.staff st ON st.id = d.staff_id
    LEFT JOIN public.teachers t ON t.id = d.teacher_id
    WHERE d.source <> 'manual' AND d.duty_date BETWEEN jd - 1 AND jd
      AND COALESCE(NULLIF(d.fingerprint_pin,''), st.fingerprint_pin, t.fingerprint_pin) = NEW.pin
  LOOP
    PERFORM public._piket_recalc(r.id, false);
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'piket_on_punch: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_piket_on_punch ON public.fingerprint_logs;
CREATE TRIGGER trg_piket_on_punch AFTER INSERT ON public.fingerprint_logs
  FOR EACH ROW EXECUTE FUNCTION public.piket_on_punch();
