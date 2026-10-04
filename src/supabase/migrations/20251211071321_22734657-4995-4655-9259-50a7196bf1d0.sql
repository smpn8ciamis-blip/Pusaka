-- Remove overly permissive public access policies that expose sensitive data

-- Students table: Remove public access
DROP POLICY IF EXISTS "Anyone can view students for status check by NIS/NISN" ON public.students;
DROP POLICY IF EXISTS "Anyone can view students for status check" ON public.students;

-- Teachers table: Remove public access  
DROP POLICY IF EXISTS "Anyone can view teachers for status check" ON public.teachers;

-- Attendance table: Remove public access
DROP POLICY IF EXISTS "Anyone can view attendance for status check" ON public.attendance;

-- Student violations table: Remove public access
DROP POLICY IF EXISTS "Anyone can view violations for status check" ON public.student_violations;

-- Student achievements table: Remove public access
DROP POLICY IF EXISTS "Anyone can view achievements for status check" ON public.student_achievements;

-- Schedules table: Remove public access
DROP POLICY IF EXISTS "Anyone can view schedules for status check" ON public.schedules;

-- Classes table: Remove public access
DROP POLICY IF EXISTS "Anyone can view classes for status check" ON public.classes;

-- Violation types table: Keep public access for reference data lookup (no PII)
-- The "Anyone can view violation types for status check" policy remains

-- School settings: Remove policy that exposes sensitive admin info
DROP POLICY IF EXISTS "Anyone can view school settings for status check" ON public.school_settings;

-- Create a secure view for public school info (only non-sensitive fields)
-- This is already handled by school_settings_public view

-- Add comments explaining the security model
COMMENT ON TABLE public.students IS 'Student records with personal information. Access restricted to authenticated staff only. Public lookups use the public-student-lookup edge function.';
COMMENT ON TABLE public.teachers IS 'Teacher records with employment information. Access restricted to authenticated users only.';
COMMENT ON TABLE public.attendance IS 'Student attendance records. Access restricted to teachers and admins only.';
COMMENT ON TABLE public.student_violations IS 'Student disciplinary records. Access restricted to teachers and admins only.';
COMMENT ON TABLE public.student_achievements IS 'Student achievement records. Access restricted to teachers and admins only.';