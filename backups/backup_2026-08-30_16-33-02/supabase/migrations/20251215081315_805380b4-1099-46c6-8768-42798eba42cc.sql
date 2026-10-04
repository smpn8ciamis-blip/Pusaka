-- Create student_accounts table to link students with auth users
CREATE TABLE public.student_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(student_id)
);

-- Enable RLS
ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;

-- Policies for student_accounts
CREATE POLICY "Admins can manage student accounts"
ON public.student_accounts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can view their own account"
ON public.student_accounts
FOR SELECT
USING (auth.uid() = user_id);

-- RLS policies for students to view their own data

-- Students can view their own student record
CREATE POLICY "Students can view own student record"
ON public.students
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    WHERE sa.student_id = students.id AND sa.user_id = auth.uid()
  )
);

-- Students can view their own attendance
CREATE POLICY "Students can view own attendance"
ON public.attendance
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    WHERE sa.student_id = attendance.student_id AND sa.user_id = auth.uid()
  )
);

-- Students can view their own grades
CREATE POLICY "Students can view own grades"
ON public.grades
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    WHERE sa.student_id = grades.student_id AND sa.user_id = auth.uid()
  )
);

-- Students can view their own violations
CREATE POLICY "Students can view own violations"
ON public.student_violations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    WHERE sa.student_id = student_violations.student_id AND sa.user_id = auth.uid()
  )
);

-- Students can view schedules for their class
CREATE POLICY "Students can view class schedules"
ON public.schedules
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    JOIN public.students s ON s.id = sa.student_id
    WHERE sa.user_id = auth.uid() AND s.class_id = schedules.class_id
  )
);

-- Students can view announcements
CREATE POLICY "Students can view announcements"
ON public.announcements
FOR SELECT
USING (
  has_role(auth.uid(), 'siswa'::app_role) AND is_active = true
);

-- Students can view their class info
CREATE POLICY "Students can view own class"
ON public.classes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.student_accounts sa
    JOIN public.students s ON s.id = sa.student_id
    WHERE sa.user_id = auth.uid() AND s.class_id = classes.id
  )
);

-- Students can view teachers (for schedule info)
CREATE POLICY "Students can view teachers for schedules"
ON public.teachers
FOR SELECT
USING (has_role(auth.uid(), 'siswa'::app_role));

-- Students can view profiles (teacher names)
CREATE POLICY "Students can view profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'siswa'::app_role));

-- Students can view academic years
CREATE POLICY "Students can view academic years"
ON public.academic_years
FOR SELECT
USING (has_role(auth.uid(), 'siswa'::app_role));

-- Students can view school settings
CREATE POLICY "Students can view school settings"
ON public.school_settings
FOR SELECT
USING (has_role(auth.uid(), 'siswa'::app_role));