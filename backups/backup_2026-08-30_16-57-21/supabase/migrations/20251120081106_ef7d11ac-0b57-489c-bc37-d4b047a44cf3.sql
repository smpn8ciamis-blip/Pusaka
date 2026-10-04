-- Update activities table to have start_date and end_date
ALTER TABLE public.activities 
  DROP COLUMN IF EXISTS activity_date;

ALTER TABLE public.activities 
  ADD COLUMN start_date DATE,
  ADD COLUMN end_date DATE;