-- Siswa yang berstatus ALPA otomatis dicatat sebagai pelanggaran (1 pelanggaran per siswa per hari).
-- Jika status alpa dikoreksi (diubah/dihapus) dan tidak ada alpa lain pada hari itu, pelanggaran OTOMATIS ikut dihapus.
-- Pelanggaran yang diinput manual tidak pernah disentuh.

ALTER TABLE public.rfid_attendance_settings
  ADD COLUMN IF NOT EXISTS alpa_violation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alpa_violation_points integer NOT NULL DEFAULT 25;

CREATE OR REPLACE FUNCTION public._alpa_violation_sync(p_student uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings record;
  v_school uuid;
  v_type_id uuid;
  v_points int;
  v_has_alpa boolean;
  c_note constant text := 'Otomatis: alfa (tanpa keterangan)';
BEGIN
  SELECT school_id INTO v_school FROM public.students WHERE id = p_student;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.attendance WHERE student_id = p_student AND date = p_date AND status = 'alpa'
  ) INTO v_has_alpa;

  SELECT * INTO v_settings FROM public.rfid_attendance_settings
   WHERE school_id IS NOT DISTINCT FROM v_school ORDER BY created_at LIMIT 1;
  IF v_settings.id IS NULL THEN
    SELECT * INTO v_settings FROM public.rfid_attendance_settings ORDER BY created_at LIMIT 1;
  END IF;

  IF NOT v_has_alpa OR (v_settings.id IS NOT NULL AND v_settings.alpa_violation_enabled = false) THEN
    -- tidak ada alpa lagi (atau fitur dimatikan): hapus pelanggaran otomatis hari itu saja bila tidak ada alpa
    IF NOT v_has_alpa THEN
      DELETE FROM public.student_violations
       WHERE student_id = p_student AND violation_date = p_date AND notes = c_note;
    END IF;
    RETURN;
  END IF;

  v_points := COALESCE(v_settings.alpa_violation_points, 25);

  SELECT id INTO v_type_id
  FROM public.violation_types
  WHERE lower(name) IN ('alfa (tanpa keterangan)', 'tidak masuk tanpa keterangan')
    AND (school_id IS NOT DISTINCT FROM v_school OR school_id IS NULL)
  ORDER BY (school_id IS NOT DISTINCT FROM v_school) DESC,
           (lower(name) = 'alfa (tanpa keterangan)') DESC
  LIMIT 1;

  IF v_type_id IS NULL THEN
    INSERT INTO public.violation_types (name, description, points, category, is_active, school_id)
    VALUES ('Alfa (Tanpa Keterangan)', 'Tercatat otomatis dari absensi berstatus alfa', v_points, 'sedang', true, v_school)
    RETURNING id INTO v_type_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_violations
     WHERE student_id = p_student AND violation_type_id = v_type_id AND violation_date = p_date
  ) THEN
    INSERT INTO public.student_violations (student_id, violation_type_id, violation_date, points, notes, school_id)
    VALUES (p_student, v_type_id, p_date, v_points, c_note, v_school);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.attendance_alpa_violation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'alpa' THEN PERFORM public._alpa_violation_sync(OLD.student_id, OLD.date); END IF;
    RETURN OLD;
  END IF;
  IF NEW.status = 'alpa' OR (TG_OP = 'UPDATE' AND OLD.status = 'alpa') THEN
    PERFORM public._alpa_violation_sync(NEW.student_id, NEW.date);
    IF TG_OP = 'UPDATE' AND (OLD.student_id <> NEW.student_id OR OLD.date <> NEW.date) AND OLD.status = 'alpa' THEN
      PERFORM public._alpa_violation_sync(OLD.student_id, OLD.date);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_alpa_violation ON public.attendance;
CREATE TRIGGER trg_attendance_alpa_violation
AFTER INSERT OR DELETE OR UPDATE OF status, student_id, date ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.attendance_alpa_violation();

-- Data lama: catat pelanggaran untuk semua hari alpa yang sudah ada (idempotent).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT student_id, date FROM public.attendance WHERE status = 'alpa' LOOP
    PERFORM public._alpa_violation_sync(r.student_id, r.date);
  END LOOP;
END $$;
