-- Drop existing check constraints that don't support manual_executor
ALTER TABLE public.official_travel_followers 
DROP CONSTRAINT IF EXISTS follower_reference_check;

ALTER TABLE public.official_travel_followers 
DROP CONSTRAINT IF EXISTS official_travel_followers_follower_type_check;

-- Add new check constraint that supports all three follower types
ALTER TABLE public.official_travel_followers 
ADD CONSTRAINT follower_type_check 
CHECK (follower_type IN ('teacher', 'student', 'manual_executor'));

-- Add new reference check constraint that validates based on follower type
ALTER TABLE public.official_travel_followers 
ADD CONSTRAINT follower_reference_check 
CHECK (
  (follower_type = 'teacher' AND teacher_id IS NOT NULL AND student_id IS NULL AND manual_executor_name IS NULL) OR
  (follower_type = 'student' AND student_id IS NOT NULL AND teacher_id IS NULL AND manual_executor_name IS NULL) OR
  (follower_type = 'manual_executor' AND manual_executor_name IS NOT NULL AND teacher_id IS NULL AND student_id IS NULL)
);