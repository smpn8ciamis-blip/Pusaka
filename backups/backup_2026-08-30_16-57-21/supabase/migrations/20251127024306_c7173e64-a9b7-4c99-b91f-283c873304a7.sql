-- Add indexes for frequently queried columns to improve performance

-- Attendance table indexes
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_schedule_date ON attendance(schedule_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- Student violations table indexes
CREATE INDEX IF NOT EXISTS idx_student_violations_student_date ON student_violations(student_id, violation_date);
CREATE INDEX IF NOT EXISTS idx_student_violations_type ON student_violations(violation_type_id);
CREATE INDEX IF NOT EXISTS idx_student_violations_date ON student_violations(violation_date);

-- Schedules table indexes
CREATE INDEX IF NOT EXISTS idx_schedules_teacher ON schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_schedules_class ON schedules(class_id);
CREATE INDEX IF NOT EXISTS idx_schedules_day ON schedules(day_of_week);

-- Teaching journals table indexes
CREATE INDEX IF NOT EXISTS idx_teaching_journals_schedule_date ON teaching_journals(schedule_id, date);
CREATE INDEX IF NOT EXISTS idx_teaching_journals_date ON teaching_journals(date);

-- Grades table indexes
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_schedule ON grades(schedule_id);

-- Students table indexes
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_nis ON students(nis);

-- Notifications table indexes
CREATE INDEX IF NOT EXISTS idx_notifications_teacher ON notifications(teacher_id);
CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id);