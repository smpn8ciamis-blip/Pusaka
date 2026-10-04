
-- CBT Exams table
CREATE TABLE public.cbt_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  school_id UUID REFERENCES public.schools(id),
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  class_id UUID REFERENCES public.classes(id),
  academic_year TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  total_questions INTEGER NOT NULL DEFAULT 0,
  pass_score NUMERIC(5,2) DEFAULT 70,
  is_active BOOLEAN DEFAULT false,
  show_result_to_student BOOLEAN DEFAULT true,
  start_datetime TIMESTAMPTZ,
  end_datetime TIMESTAMPTZ,
  shuffle_questions BOOLEAN DEFAULT false,
  shuffle_options BOOLEAN DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CBT Questions table
CREATE TABLE public.cbt_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.cbt_exams(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  option_e TEXT,
  correct_answer TEXT NOT NULL CHECK (correct_answer IN ('A','B','C','D','E')),
  points NUMERIC(5,2) DEFAULT 1,
  school_id UUID REFERENCES public.schools(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CBT Exam Sessions (student attempts)
CREATE TABLE public.cbt_exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.cbt_exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id),
  user_id UUID NOT NULL,
  start_time TIMESTAMPTZ DEFAULT now(),
  end_time TIMESTAMPTZ,
  score NUMERIC(5,2),
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','timeout')),
  school_id UUID REFERENCES public.schools(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exam_id, student_id)
);

-- CBT Student Answers
CREATE TABLE public.cbt_student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.cbt_exam_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.cbt_questions(id) ON DELETE CASCADE,
  selected_answer TEXT CHECK (selected_answer IN ('A','B','C','D','E')),
  is_correct BOOLEAN,
  school_id UUID REFERENCES public.schools(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, question_id)
);

-- Add letter_number and letter_date to student_dispensations
ALTER TABLE public.student_dispensations 
  ADD COLUMN IF NOT EXISTS letter_number TEXT,
  ADD COLUMN IF NOT EXISTS letter_date DATE DEFAULT CURRENT_DATE;

-- Enable RLS
ALTER TABLE public.cbt_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_student_answers ENABLE ROW LEVEL SECURITY;

-- Auto set school_id triggers
CREATE TRIGGER auto_set_school_id_cbt_exams BEFORE INSERT ON public.cbt_exams FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_cbt_questions BEFORE INSERT ON public.cbt_questions FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_cbt_exam_sessions BEFORE INSERT ON public.cbt_exam_sessions FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_cbt_student_answers BEFORE INSERT ON public.cbt_student_answers FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

-- RLS Policies for cbt_exams
CREATE POLICY "Users can view exams in their school" ON public.cbt_exams FOR SELECT TO authenticated
  USING (school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "Teachers and admins can create exams" ON public.cbt_exams FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_user_school_id());
CREATE POLICY "Teachers can update their own exams" ON public.cbt_exams FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Teachers can delete their own exams" ON public.cbt_exams FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for cbt_questions
CREATE POLICY "Users can view questions for their school exams" ON public.cbt_questions FOR SELECT TO authenticated
  USING (school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "Teachers can insert questions" ON public.cbt_questions FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_user_school_id());
CREATE POLICY "Teachers can update questions" ON public.cbt_questions FOR UPDATE TO authenticated
  USING (school_id = public.get_user_school_id());
CREATE POLICY "Teachers can delete questions" ON public.cbt_questions FOR DELETE TO authenticated
  USING (school_id = public.get_user_school_id());

-- RLS Policies for cbt_exam_sessions
CREATE POLICY "Users can view sessions in their school" ON public.cbt_exam_sessions FOR SELECT TO authenticated
  USING (school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "Students can create sessions" ON public.cbt_exam_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Students can update their sessions" ON public.cbt_exam_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for cbt_student_answers
CREATE POLICY "Users can view answers in their school" ON public.cbt_student_answers FOR SELECT TO authenticated
  USING (school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "Students can insert answers" ON public.cbt_student_answers FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_user_school_id());
CREATE POLICY "Students can update answers" ON public.cbt_student_answers FOR UPDATE TO authenticated
  USING (school_id = public.get_user_school_id());

-- Update trigger for cbt_exams
CREATE TRIGGER update_cbt_exams_updated_at BEFORE UPDATE ON public.cbt_exams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
