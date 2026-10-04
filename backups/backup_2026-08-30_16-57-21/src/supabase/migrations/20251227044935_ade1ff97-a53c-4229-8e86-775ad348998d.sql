-- Add wakasek_sarpras_teacher_id column to school_settings table
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS wakasek_sarpras_teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL;