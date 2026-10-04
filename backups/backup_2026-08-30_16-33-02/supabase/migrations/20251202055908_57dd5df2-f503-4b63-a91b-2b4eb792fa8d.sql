-- Create student_achievements table
CREATE TABLE IF NOT EXISTS public.student_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  achievement_name TEXT NOT NULL,
  achievement_type TEXT NOT NULL DEFAULT 'Akademik',
  level TEXT NOT NULL DEFAULT 'Sekolah',
  achievement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  certificate_url TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_student_achievements_student_id ON public.student_achievements(student_id);
CREATE INDEX idx_student_achievements_date ON public.student_achievements(achievement_date);
CREATE INDEX idx_student_achievements_type ON public.student_achievements(achievement_type);

-- Enable RLS
ALTER TABLE public.student_achievements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all achievements"
  ON public.student_achievements
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can view achievements"
  ON public.student_achievements
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view achievements for status check"
  ON public.student_achievements
  FOR SELECT
  TO anon
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_student_achievements_updated_at
  BEFORE UPDATE ON public.student_achievements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();