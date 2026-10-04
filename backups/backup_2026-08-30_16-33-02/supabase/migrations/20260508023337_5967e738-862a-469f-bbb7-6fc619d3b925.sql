
-- Add new columns to cbt_exams
ALTER TABLE public.cbt_exams 
  ADD COLUMN IF NOT EXISTS exam_token TEXT,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS allow_resume BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS require_token BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exam_type TEXT NOT NULL DEFAULT 'mixed';

-- Add new columns to cbt_questions for essay support
ALTER TABLE public.cbt_questions 
  ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'multiple_choice',
  ADD COLUMN IF NOT EXISTS essay_answer_key TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add new columns to cbt_exam_sessions for resume + attempts + grading
ALTER TABLE public.cbt_exam_sessions
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS time_remaining_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS essay_score NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pg_score NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grading_status TEXT NOT NULL DEFAULT 'auto_graded',
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now();

-- Add new columns to cbt_student_answers for essay
ALTER TABLE public.cbt_student_answers
  ADD COLUMN IF NOT EXISTS essay_answer TEXT,
  ADD COLUMN IF NOT EXISTS essay_score_given NUMERIC,
  ADD COLUMN IF NOT EXISTS grader_note TEXT,
  ADD COLUMN IF NOT EXISTS graded_by UUID,
  ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;

-- Question templates (bank soal)
CREATE TABLE IF NOT EXISTS public.cbt_question_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cbt_question_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own school templates" ON public.cbt_question_templates;
CREATE POLICY "Users view own school templates" ON public.cbt_question_templates
  FOR SELECT USING (school_id = public.get_user_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "Teachers manage own templates" ON public.cbt_question_templates;
CREATE POLICY "Teachers manage own templates" ON public.cbt_question_templates
  FOR ALL USING (
    (created_by = auth.uid() AND school_id = public.get_user_school_id())
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_super_admin()
  )
  WITH CHECK (
    (created_by = auth.uid() AND school_id = public.get_user_school_id())
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_super_admin()
  );

-- Auto set school_id on templates
DROP TRIGGER IF EXISTS auto_school_id_cbt_templates ON public.cbt_question_templates;
CREATE TRIGGER auto_school_id_cbt_templates
  BEFORE INSERT ON public.cbt_question_templates
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

DROP TRIGGER IF EXISTS update_cbt_templates_updated_at ON public.cbt_question_templates;
CREATE TRIGGER update_cbt_templates_updated_at
  BEFORE UPDATE ON public.cbt_question_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
