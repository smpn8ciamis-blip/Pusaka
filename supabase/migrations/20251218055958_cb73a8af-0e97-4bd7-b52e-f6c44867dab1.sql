-- Allow kesiswaan to insert achievements
CREATE POLICY "Kesiswaan can insert achievements"
ON public.student_achievements
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'kesiswaan'));

-- Allow kesiswaan to update achievements
CREATE POLICY "Kesiswaan can update achievements"
ON public.student_achievements
FOR UPDATE
USING (has_role(auth.uid(), 'kesiswaan'));

-- Allow kesiswaan to delete achievements
CREATE POLICY "Kesiswaan can delete achievements"
ON public.student_achievements
FOR DELETE
USING (has_role(auth.uid(), 'kesiswaan'));