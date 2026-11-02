-- =====================================================================
-- Absensi manual siswa: bila satu guru / wali kelas mengabsen sebuah kelas pada suatu hari,
-- absensi itu OTOMATIS tercatat juga pada jadwal guru lain yang mengajar kelas yang sama pada
-- hari yang sama (tahun ajaran & semester yang sama). Aturan:
--   * Salinan hanya dibuat bila jadwal tujuan BELUM punya absensi siswa tsb pada tanggal itu
--     (absen yang sudah diisi guru lain tidak pernah ditimpa).
--   * Bila absen sumber diubah (status/catatan), salinan yang belum diubah guru lain ikut berubah.
--   * Bila guru lain mengubah status/catatan salinannya sendiri, salinan itu "lepas": tidak lagi
--     mengikuti sumber, dan perubahannya tidak disebarkan ke jadwal lain.
--   * Menghapus absen sumber tidak menghapus salinan (tidak ada data yang hilang otomatis).
-- Aman dijalankan ulang.
-- =====================================================================

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS copied_from_schedule_id uuid,
  ADD COLUMN IF NOT EXISTS copy_detached boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_attendance_copied_from
  ON public.attendance (copied_from_schedule_id, date)
  WHERE copied_from_schedule_id IS NOT NULL;

-- 1. Salinan yang diubah guru lain (langsung dari aplikasi) menjadi "lepas" ------------------
CREATE OR REPLACE FUNCTION public.attendance_detach_copy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- depth 1 = perubahan langsung oleh pengguna; depth > 1 = pembaruan otomatis dari trigger penyebar
  IF pg_trigger_depth() = 1
     AND OLD.copied_from_schedule_id IS NOT NULL
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.notes IS DISTINCT FROM OLD.notes) THEN
    NEW.copied_from_schedule_id := NULL;
    NEW.copy_detached := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_detach_copy ON public.attendance;
CREATE TRIGGER trg_attendance_detach_copy
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_detach_copy();

-- 2. Sebarkan absen ke jadwal lain pada kelas & hari yang sama --------------------------------
CREATE OR REPLACE FUNCTION public.attendance_propagate_to_class_day()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sem integer;
BEGIN
  -- Jangan menyebar dari pembaruan otomatis, salinan, maupun salinan yang sudah dilepas.
  IF pg_trigger_depth() > 1
     OR NEW.copied_from_schedule_id IS NOT NULL
     OR NEW.copy_detached
     OR NEW.schedule_id IS NULL
     OR NEW.sched_class_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- semester sumber; jadwal lama tanpa isian semester memakai semester aktif di pengaturan sekolah
  v_sem := COALESCE(NEW.sched_semester, (SELECT active_semester FROM public.school_settings LIMIT 1));

  -- (a) buat salinan di jadwal lain yang belum punya absen siswa ini pada tanggal tsb
  INSERT INTO public.attendance
    (schedule_id, student_id, date, status, notes, created_by, school_id, copied_from_schedule_id)
  SELECT s.id, NEW.student_id, NEW.date, NEW.status, NEW.notes, NEW.created_by, NEW.school_id, NEW.schedule_id
  FROM public.schedules s
  WHERE s.class_id = NEW.sched_class_id
    AND s.id <> NEW.schedule_id
    AND s.is_active
    AND s.day_of_week IN (EXTRACT(ISODOW FROM NEW.date)::int, EXTRACT(DOW FROM NEW.date)::int)
    AND s.academic_year = NEW.sched_academic_year
    AND (s.semester IS NULL OR v_sem IS NULL OR s.semester = v_sem)
  ON CONFLICT (schedule_id, student_id, date) DO NOTHING;

  -- (b) absen sumber berubah: salinan yang belum diubah guru lain ikut berubah
  IF TG_OP = 'UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.notes IS DISTINCT FROM OLD.notes) THEN
    UPDATE public.attendance c
       SET status = NEW.status, notes = NEW.notes
     WHERE c.copied_from_schedule_id = NEW.schedule_id
       AND c.student_id = NEW.student_id
       AND c.date = NEW.date;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_propagate_to_class_day() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_attendance_propagate ON public.attendance;
CREATE TRIGGER trg_attendance_propagate
  AFTER INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_propagate_to_class_day();

-- 3. Peringatan "3 hari berturut-turut": hitung HARI berbeda, bukan jumlah baris.
--    Dengan salinan per jadwal, COUNT(*) akan menganggap satu hari tidak hadir (3 jam pelajaran)
--    sebagai 3 hari dan mengirim peringatan palsu ke wali kelas.
CREATE OR REPLACE FUNCTION public.check_consecutive_absences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  consecutive_count INTEGER;
  homeroom_teacher_id UUID;
  student_name TEXT;
  existing_notification_count INTEGER;
BEGIN
  IF NEW.status IN ('sakit', 'izin', 'alpa') THEN
    SELECT COUNT(DISTINCT date) INTO consecutive_count
    FROM public.attendance
    WHERE student_id = NEW.student_id
    AND status IN ('sakit', 'izin', 'alpa')
    AND date >= NEW.date - INTERVAL '2 days'
    AND date <= NEW.date;

    IF consecutive_count >= 3 THEN
      SELECT c.homeroom_teacher_id, s.full_name
      INTO homeroom_teacher_id, student_name
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE s.id = NEW.student_id;

      SELECT COUNT(*) INTO existing_notification_count
      FROM public.notifications
      WHERE teacher_id = homeroom_teacher_id
      AND student_id = NEW.student_id
      AND type = 'absence_alert'
      AND DATE(created_at) = CURRENT_DATE;

      IF homeroom_teacher_id IS NOT NULL AND existing_notification_count = 0 THEN
        INSERT INTO public.notifications (teacher_id, student_id, message, type)
        VALUES (
          homeroom_teacher_id,
          NEW.student_id,
          student_name || ' telah tidak hadir selama 3 hari berturut-turut',
          'absence_alert'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
