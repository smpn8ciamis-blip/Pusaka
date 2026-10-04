
-- Create student_mutations table for tracking student transfers out
CREATE TABLE public.student_mutations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  mutation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  destination_school TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  school_id UUID REFERENCES public.schools(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_mutations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view mutations in their school"
  ON public.student_mutations FOR SELECT TO authenticated
  USING (school_id = public.get_user_school_id());

CREATE POLICY "Admin can insert mutations"
  ON public.student_mutations FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_user_school_id());

CREATE POLICY "Admin can update mutations"
  ON public.student_mutations FOR UPDATE TO authenticated
  USING (school_id = public.get_user_school_id());

CREATE POLICY "Admin can delete mutations"
  ON public.student_mutations FOR DELETE TO authenticated
  USING (school_id = public.get_user_school_id());

-- Auto-set school_id trigger
CREATE TRIGGER set_school_id_student_mutations
  BEFORE INSERT ON public.student_mutations
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

-- Update timestamp trigger
CREATE TRIGGER update_student_mutations_updated_at
  BEFORE UPDATE ON public.student_mutations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add status column to students table for tracking active/mutation status
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aktif';
