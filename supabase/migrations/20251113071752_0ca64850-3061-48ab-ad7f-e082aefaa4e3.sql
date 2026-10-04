-- Add academic year and exam name fields to school_settings
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2024/2025',
ADD COLUMN IF NOT EXISTS exam_name TEXT DEFAULT 'PENILAIAN SUMATIF AKHIR SEMESTER (PSAS)';