-- Add INSERT policy for teachers on student_achievements
CREATE POLICY "Teachers can insert achievements"
ON public.student_achievements
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));

-- Add UPDATE policy for teachers on student_achievements
CREATE POLICY "Teachers can update achievements"
ON public.student_achievements
FOR UPDATE
USING (has_role(auth.uid(), 'teacher'::app_role));

-- Add DELETE policy for teachers on student_achievements
CREATE POLICY "Teachers can delete achievements"
ON public.student_achievements
FOR DELETE
USING (has_role(auth.uid(), 'teacher'::app_role));