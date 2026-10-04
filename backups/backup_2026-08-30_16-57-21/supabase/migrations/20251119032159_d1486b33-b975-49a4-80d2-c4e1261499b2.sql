-- Add active_semester field to school_settings table
ALTER TABLE public.school_settings 
ADD COLUMN active_semester integer DEFAULT 1 CHECK (active_semester IN (1, 2));