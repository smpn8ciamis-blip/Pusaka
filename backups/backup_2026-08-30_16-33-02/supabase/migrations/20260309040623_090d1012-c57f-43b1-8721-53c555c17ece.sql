
ALTER TABLE public.announcements 
ADD COLUMN IF NOT EXISTS target_audience TEXT NOT NULL DEFAULT 'semua';

COMMENT ON COLUMN public.announcements.target_audience IS 'Target audience: semua, siswa, guru, staff';
