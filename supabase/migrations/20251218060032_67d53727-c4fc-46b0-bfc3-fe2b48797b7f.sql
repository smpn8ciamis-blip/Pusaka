-- Allow kesiswaan to insert violations
CREATE POLICY "Kesiswaan can insert violations"
ON public.student_violations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'kesiswaan'));

-- Allow kesiswaan to update violations
CREATE POLICY "Kesiswaan can update violations"
ON public.student_violations
FOR UPDATE
USING (has_role(auth.uid(), 'kesiswaan'));

-- Allow kesiswaan to delete violations
CREATE POLICY "Kesiswaan can delete violations"
ON public.student_violations
FOR DELETE
USING (has_role(auth.uid(), 'kesiswaan'));