-- Add RLS policies for public attendance check feature
-- Allow anonymous users to read attendance, violations, and related data

-- Allow reading attendance records
CREATE POLICY "Anyone can view attendance for status check"
ON public.attendance
FOR SELECT
TO anon
USING (true);

-- Allow reading violation records
CREATE POLICY "Anyone can view violations for status check"
ON public.student_violations
FOR SELECT
TO anon
USING (true);

-- Allow reading violation types
CREATE POLICY "Anyone can view violation types for status check"
ON public.violation_types
FOR SELECT
TO anon
USING (true);

-- Allow reading schedules (needed for attendance details)
CREATE POLICY "Anyone can view schedules for status check"
ON public.schedules
FOR SELECT
TO anon
USING (true);

-- Allow reading classes (needed for student class info)
CREATE POLICY "Anyone can view classes for status check"
ON public.classes
FOR SELECT
TO anon
USING (true);

-- Allow reading teachers (needed for homeroom teacher info)
CREATE POLICY "Anyone can view teachers for status check"
ON public.teachers
FOR SELECT
TO anon
USING (true);

-- Allow reading profiles (needed for teacher names)
CREATE POLICY "Anyone can view profiles for status check"
ON public.profiles
FOR SELECT
TO anon
USING (true);

-- Allow reading school settings (needed for academic year/semester info)
CREATE POLICY "Anyone can view school settings for status check"
ON public.school_settings
FOR SELECT
TO anon
USING (true);