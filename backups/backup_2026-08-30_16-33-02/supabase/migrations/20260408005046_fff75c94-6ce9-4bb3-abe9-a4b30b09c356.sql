
-- Add guru_piket to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'guru_piket';

-- Create student_dispensations table
CREATE TABLE public.student_dispensations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id),
  dispensation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME,
  end_time TIME,
  reason TEXT NOT NULL,
  reason_category TEXT NOT NULL DEFAULT 'lainnya',
  status TEXT NOT NULL DEFAULT 'approved',
  notes TEXT,
  guru_piket_id UUID,
  school_id UUID REFERENCES public.schools(id),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_dispensations ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view dispensations in their school
CREATE POLICY "School members can view dispensations"
ON public.student_dispensations FOR SELECT TO authenticated
USING (school_id = public.get_user_school_id() OR public.is_super_admin());

-- RLS: guru_piket, kesiswaan, admin can insert
CREATE POLICY "Authorized roles can create dispensations"
ON public.student_dispensations FOR INSERT TO authenticated
WITH CHECK (school_id = public.get_user_school_id());

-- RLS: guru_piket, kesiswaan, admin can update
CREATE POLICY "Authorized roles can update dispensations"
ON public.student_dispensations FOR UPDATE TO authenticated
USING (school_id = public.get_user_school_id());

-- RLS: guru_piket, kesiswaan, admin can delete
CREATE POLICY "Authorized roles can delete dispensations"
ON public.student_dispensations FOR DELETE TO authenticated
USING (school_id = public.get_user_school_id());

-- Auto set school_id trigger
CREATE TRIGGER set_school_id_on_student_dispensations
BEFORE INSERT ON public.student_dispensations
FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

-- Updated_at trigger
CREATE TRIGGER update_student_dispensations_updated_at
BEFORE UPDATE ON public.student_dispensations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster queries
CREATE INDEX idx_student_dispensations_school_date ON public.student_dispensations(school_id, dispensation_date);
CREATE INDEX idx_student_dispensations_student ON public.student_dispensations(student_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_dispensations;
