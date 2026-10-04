-- Policies attendance untuk guru_piket
CREATE POLICY "Guru Piket can view all attendance"
ON public.attendance FOR SELECT
USING (has_role(auth.uid(), 'guru_piket'::app_role));

CREATE POLICY "Guru Piket can create attendance"
ON public.attendance FOR INSERT
WITH CHECK (has_role(auth.uid(), 'guru_piket'::app_role));

CREATE POLICY "Guru Piket can update attendance"
ON public.attendance FOR UPDATE
USING (has_role(auth.uid(), 'guru_piket'::app_role));

CREATE POLICY "Guru Piket can delete attendance"
ON public.attendance FOR DELETE
USING (has_role(auth.uid(), 'guru_piket'::app_role));

-- Guru piket bisa view students (untuk pilih siswa di absensi)
CREATE POLICY "Guru Piket can view students"
ON public.students FOR SELECT
USING (has_role(auth.uid(), 'guru_piket'::app_role));

-- Kolom jabatan kepala sekolah (Kepala Sekolah / Plt. Kepala Sekolah, dll)
ALTER TABLE public.school_settings
ADD COLUMN IF NOT EXISTS headmaster_position TEXT NOT NULL DEFAULT 'Kepala Sekolah';