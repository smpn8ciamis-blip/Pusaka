-- Allow kesiswaan to view all classes for student data display
CREATE POLICY "Kesiswaan can view all classes"
ON public.classes
FOR SELECT
USING (has_role(auth.uid(), 'kesiswaan'));