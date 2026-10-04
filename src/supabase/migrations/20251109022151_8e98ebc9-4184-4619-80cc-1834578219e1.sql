-- Drop existing policies that need to be updated
DROP POLICY IF EXISTS "Teachers can view their attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can create attendance for their schedules" ON public.attendance;

-- Allow teachers to view attendance for any class they teach on any schedule
-- This allows them to see previous attendance from earlier periods
CREATE POLICY "Teachers can view attendance for classes they teach"
ON public.attendance
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM schedules s1
    JOIN schedules s2 ON s1.class_id = s2.class_id
    JOIN teachers t ON s1.teacher_id = t.id
    WHERE s2.id = attendance.schedule_id
    AND t.user_id = auth.uid()
  )
);

-- Allow teachers to create attendance for their own schedules
CREATE POLICY "Teachers can create attendance for their schedules"
ON public.attendance
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM schedules s
    JOIN teachers t ON s.teacher_id = t.id
    WHERE s.id = attendance.schedule_id
    AND t.user_id = auth.uid()
  )
);

-- Allow homeroom teachers to update attendance for their class
CREATE POLICY "Homeroom teachers can update their class attendance"
ON public.attendance
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM students s
    JOIN classes c ON s.class_id = c.id
    JOIN teachers t ON c.homeroom_teacher_id = t.id
    WHERE s.id = attendance.student_id
    AND t.user_id = auth.uid()
  )
);

-- Allow homeroom teachers to delete attendance for their class (if needed)
CREATE POLICY "Homeroom teachers can delete their class attendance"
ON public.attendance
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM students s
    JOIN classes c ON s.class_id = c.id
    JOIN teachers t ON c.homeroom_teacher_id = t.id
    WHERE s.id = attendance.student_id
    AND t.user_id = auth.uid()
  )
);