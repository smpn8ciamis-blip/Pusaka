-- Allow kesiswaan to view all students for name display
CREATE POLICY "Kesiswaan can view all students"
ON public.students
FOR SELECT
USING (has_role(auth.uid(), 'kesiswaan'));