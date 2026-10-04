-- Update RLS policy for student_violations: only admins can delete
DROP POLICY IF EXISTS "Teachers can delete violations" ON public.student_violations;

CREATE POLICY "Only admins can delete violations" 
ON public.student_violations 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));