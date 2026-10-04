-- Add RLS policy to allow public read access to students table for status checking
-- This is needed for the public attendance check feature (/cek-status-peserta-didik)
-- Policy allows anyone to query students by NIS or NISN (no authentication required)

CREATE POLICY "Anyone can view students for status check by NIS/NISN"
ON public.students
FOR SELECT
TO anon
USING (true);