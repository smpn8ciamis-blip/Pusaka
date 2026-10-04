-- Allow teachers to insert schedules for themselves
CREATE POLICY "Teachers can create their own schedules"
ON public.schedules
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.id = schedules.teacher_id
    AND t.user_id = auth.uid()
  )
);

-- Allow teachers to update their own schedules
CREATE POLICY "Teachers can update their own schedules"
ON public.schedules
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.id = schedules.teacher_id
    AND t.user_id = auth.uid()
  )
);

-- Allow teachers to delete their own schedules
CREATE POLICY "Teachers can delete their own schedules"
ON public.schedules
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE t.id = schedules.teacher_id
    AND t.user_id = auth.uid()
  )
);