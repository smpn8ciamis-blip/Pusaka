-- Allow homeroom teachers to view attendance for their class students
CREATE POLICY "Homeroom teachers can view their class attendance"
ON attendance
FOR SELECT
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

-- Allow homeroom teachers to view grades for their class students
CREATE POLICY "Homeroom teachers can view their class grades"
ON grades
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM students s
    JOIN classes c ON s.class_id = c.id
    JOIN teachers t ON c.homeroom_teacher_id = t.id
    WHERE s.id = grades.student_id
    AND t.user_id = auth.uid()
  )
);