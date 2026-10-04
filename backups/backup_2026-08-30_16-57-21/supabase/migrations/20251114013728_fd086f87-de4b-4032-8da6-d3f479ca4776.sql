-- Add exam_schedule field to school_settings table
ALTER TABLE public.school_settings 
ADD COLUMN exam_schedule JSONB DEFAULT '[]'::jsonb;