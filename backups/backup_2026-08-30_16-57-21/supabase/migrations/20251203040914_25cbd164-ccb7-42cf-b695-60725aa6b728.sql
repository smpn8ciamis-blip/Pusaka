-- Create table for SPPD followers (can be teachers or students)
CREATE TABLE public.official_travel_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_travel_id uuid NOT NULL REFERENCES public.official_travel_letters(id) ON DELETE CASCADE,
  follower_type text NOT NULL CHECK (follower_type IN ('teacher', 'student')),
  teacher_id uuid REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT follower_reference_check CHECK (
    (follower_type = 'teacher' AND teacher_id IS NOT NULL AND student_id IS NULL) OR
    (follower_type = 'student' AND student_id IS NOT NULL AND teacher_id IS NULL)
  )
);

-- Enable RLS
ALTER TABLE public.official_travel_followers ENABLE ROW LEVEL SECURITY;

-- RLS policies for official_travel_followers
CREATE POLICY "Tata Usaha can manage official travel followers"
ON public.official_travel_followers
FOR ALL
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Admins can view official travel followers"
ON public.official_travel_followers
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add RLS policy for Tata Usaha to view students
CREATE POLICY "Tata Usaha can view students"
ON public.students
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));