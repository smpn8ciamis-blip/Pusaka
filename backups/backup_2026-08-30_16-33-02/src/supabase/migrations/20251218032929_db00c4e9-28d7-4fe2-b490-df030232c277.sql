-- Allow kesiswaan to view all attendance records
CREATE POLICY "Kesiswaan can view all attendance"
ON public.attendance
FOR SELECT
USING (has_role(auth.uid(), 'kesiswaan'));

-- Allow kesiswaan to view all student violations
CREATE POLICY "Kesiswaan can view all violations"
ON public.student_violations
FOR SELECT
USING (has_role(auth.uid(), 'kesiswaan'));

-- Allow kesiswaan to view all grades
CREATE POLICY "Kesiswaan can view all grades"
ON public.grades
FOR SELECT
USING (has_role(auth.uid(), 'kesiswaan'));

-- Allow kesiswaan to view all teaching journals
CREATE POLICY "Kesiswaan can view all teaching journals"
ON public.teaching_journals
FOR SELECT
USING (has_role(auth.uid(), 'kesiswaan'));

-- Allow kesiswaan to view all student achievements
CREATE POLICY "Kesiswaan can view all achievements"
ON public.student_achievements
FOR SELECT
USING (has_role(auth.uid(), 'kesiswaan'));