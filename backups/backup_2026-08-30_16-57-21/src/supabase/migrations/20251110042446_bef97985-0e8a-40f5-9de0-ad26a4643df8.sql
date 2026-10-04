-- Add RLS policy to allow teachers to update attendance for their schedules
CREATE POLICY "Teachers can update attendance for their schedules" 
ON public.attendance 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1
    FROM schedules s
    JOIN teachers t ON s.teacher_id = t.id
    WHERE s.id = attendance.schedule_id
    AND t.user_id = auth.uid()
  )
);