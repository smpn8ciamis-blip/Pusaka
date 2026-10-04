-- Add RLS policy to allow homeroom teachers to create attendance for their class students
CREATE POLICY "Homeroom teachers can create attendance for their class" 
ON public.attendance 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM students s
    JOIN classes c ON s.class_id = c.id
    JOIN teachers t ON c.homeroom_teacher_id = t.id
    WHERE s.id = attendance.student_id
    AND t.user_id = auth.uid()
  )
);