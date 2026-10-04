-- Create grades table
CREATE TABLE public.grades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  tugas DECIMAL(5,2) DEFAULT 0 CHECK (tugas >= 0 AND tugas <= 100),
  kuis DECIMAL(5,2) DEFAULT 0 CHECK (kuis >= 0 AND kuis <= 100),
  uts DECIMAL(5,2) DEFAULT 0 CHECK (uts >= 0 AND uts <= 100),
  uas DECIMAL(5,2) DEFAULT 0 CHECK (uas >= 0 AND uas <= 100),
  praktik DECIMAL(5,2) DEFAULT 0 CHECK (praktik >= 0 AND praktik <= 100),
  final_grade DECIMAL(5,2) GENERATED ALWAYS AS (
    (tugas * 0.2 + kuis * 0.2 + uts * 0.25 + uas * 0.25 + praktik * 0.1)
  ) STORED,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, schedule_id)
);

-- Enable RLS
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- RLS Policies for grades
CREATE POLICY "Admins can manage all grades"
ON public.grades
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view grades for their schedules"
ON public.grades
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM schedules s
    JOIN teachers t ON s.teacher_id = t.id
    WHERE s.id = grades.schedule_id
    AND t.user_id = auth.uid()
  )
);

CREATE POLICY "Teachers can insert grades for their schedules"
ON public.grades
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM schedules s
    JOIN teachers t ON s.teacher_id = t.id
    WHERE s.id = grades.schedule_id
    AND t.user_id = auth.uid()
  )
  AND created_by = auth.uid()
);

CREATE POLICY "Teachers can update grades for their schedules"
ON public.grades
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM schedules s
    JOIN teachers t ON s.teacher_id = t.id
    WHERE s.id = grades.schedule_id
    AND t.user_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_grades_updated_at
BEFORE UPDATE ON public.grades
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();