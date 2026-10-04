ALTER TABLE public.students ADD COLUMN IF NOT EXISTS rfid_uid text;
CREATE UNIQUE INDEX IF NOT EXISTS students_rfid_uid_key ON public.students(rfid_uid) WHERE rfid_uid IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.rfid_attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id),
  check_in_start time NOT NULL DEFAULT '06:00',
  check_in_end time NOT NULL DEFAULT '07:30',
  late_after time NOT NULL DEFAULT '07:00',
  check_out_start time NOT NULL DEFAULT '13:00',
  check_out_end time NOT NULL DEFAULT '17:00',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfid_attendance_settings TO authenticated;
GRANT SELECT ON public.rfid_attendance_settings TO anon;
GRANT ALL ON public.rfid_attendance_settings TO service_role;
ALTER TABLE public.rfid_attendance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rfid settings" ON public.rfid_attendance_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage rfid settings" ON public.rfid_attendance_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.rfid_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Jakarta')::date,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text NOT NULL DEFAULT 'hadir',
  notes text,
  school_id uuid REFERENCES public.schools(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfid_attendance TO authenticated;
GRANT ALL ON public.rfid_attendance TO service_role;
ALTER TABLE public.rfid_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage rfid attendance" ON public.rfid_attendance FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'guru_piket')
    OR public.has_role(auth.uid(),'kesiswaan') OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      JOIN public.teachers t ON t.id = c.homeroom_teacher_id
      WHERE s.id = rfid_attendance.student_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'guru_piket')
    OR public.has_role(auth.uid(),'kesiswaan') OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.classes c ON c.id = s.class_id
      JOIN public.teachers t ON t.id = c.homeroom_teacher_id
      WHERE s.id = rfid_attendance.student_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Students view own rfid attendance" ON public.rfid_attendance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.student_accounts sa WHERE sa.student_id = rfid_attendance.student_id AND sa.user_id = auth.uid()));

CREATE POLICY "school_isolation_rfid_attendance" ON public.rfid_attendance AS RESTRICTIVE TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

CREATE TRIGGER auto_set_school_id_rfid_attendance BEFORE INSERT ON public.rfid_attendance FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER update_rfid_attendance_updated_at BEFORE UPDATE ON public.rfid_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rfid_settings_updated_at BEFORE UPDATE ON public.rfid_attendance_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.rfid_attendance_settings (id) SELECT gen_random_uuid() WHERE NOT EXISTS (SELECT 1 FROM public.rfid_attendance_settings);