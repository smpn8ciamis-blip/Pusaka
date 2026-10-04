-- Add RLS policy to allow public read access to attendance data
-- This is needed for the public student attendance check page
CREATE POLICY "Anyone can view attendance data"
ON public.attendance
FOR SELECT
USING (true);
