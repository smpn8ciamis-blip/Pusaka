-- Create table for 7 Habits Journal entries
CREATE TABLE public.habit_journals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  habit_number INTEGER NOT NULL CHECK (habit_number >= 1 AND habit_number <= 7),
  journal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  activity_description TEXT NOT NULL,
  reflection TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.habit_journals ENABLE ROW LEVEL SECURITY;

-- Students can view their own journals
CREATE POLICY "Students can view own habit journals"
ON public.habit_journals
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    WHERE sa.student_id = habit_journals.student_id
    AND sa.user_id = auth.uid()
  )
);

-- Students can insert their own journals
CREATE POLICY "Students can insert own habit journals"
ON public.habit_journals
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    WHERE sa.student_id = habit_journals.student_id
    AND sa.user_id = auth.uid()
  )
);

-- Students can update their own journals
CREATE POLICY "Students can update own habit journals"
ON public.habit_journals
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    WHERE sa.student_id = habit_journals.student_id
    AND sa.user_id = auth.uid()
  )
);

-- Students can delete their own journals
CREATE POLICY "Students can delete own habit journals"
ON public.habit_journals
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    WHERE sa.student_id = habit_journals.student_id
    AND sa.user_id = auth.uid()
  )
);

-- Admins can view all habit journals
CREATE POLICY "Admins can view all habit journals"
ON public.habit_journals
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage all habit journals
CREATE POLICY "Admins can manage all habit journals"
ON public.habit_journals
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Kesiswaan can view all habit journals
CREATE POLICY "Kesiswaan can view all habit journals"
ON public.habit_journals
FOR SELECT
USING (has_role(auth.uid(), 'kesiswaan'::app_role));

-- Homeroom teachers can view their class students' journals
CREATE POLICY "Homeroom teachers can view class habit journals"
ON public.habit_journals
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.classes c ON s.class_id = c.id
    JOIN public.teachers t ON c.homeroom_teacher_id = t.id
    WHERE s.id = habit_journals.student_id
    AND t.user_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_habit_journals_updated_at
BEFORE UPDATE ON public.habit_journals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();