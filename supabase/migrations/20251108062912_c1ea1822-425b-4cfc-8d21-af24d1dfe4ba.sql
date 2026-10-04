-- Add app_name column to school_settings table
ALTER TABLE public.school_settings 
ADD COLUMN app_name TEXT DEFAULT 'Sistem Manajemen Sekolah';