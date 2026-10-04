-- Fix retry duplicate key + add anti-cheat fields
ALTER TABLE public.cbt_exam_sessions DROP CONSTRAINT IF EXISTS cbt_exam_sessions_exam_id_student_id_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cbt_exam_sessions_exam_student_attempt_key') THEN
    ALTER TABLE public.cbt_exam_sessions
      ADD CONSTRAINT cbt_exam_sessions_exam_student_attempt_key
      UNIQUE (exam_id, student_id, attempt_number);
  END IF;
END $$;

-- Allow 'paused' status
ALTER TABLE public.cbt_exam_sessions DROP CONSTRAINT IF EXISTS cbt_exam_sessions_status_check;
ALTER TABLE public.cbt_exam_sessions ADD CONSTRAINT cbt_exam_sessions_status_check
  CHECK (status = ANY (ARRAY['in_progress'::text, 'paused'::text, 'completed'::text, 'timeout'::text]));

-- Anti-cheat config on exam
ALTER TABLE public.cbt_exams
  ADD COLUMN IF NOT EXISTS anti_cheat_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exit_token TEXT,
  ADD COLUMN IF NOT EXISTS max_violations INTEGER NOT NULL DEFAULT 3;

-- Violations log
CREATE TABLE IF NOT EXISTS public.cbt_session_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.cbt_exam_sessions(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.cbt_exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  violation_type TEXT NOT NULL, -- 'tab_switch' | 'blur' | 'fullscreen_exit' | 'copy' | 'paste'
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cbt_violations_session ON public.cbt_session_violations(session_id);
CREATE INDEX IF NOT EXISTS idx_cbt_violations_exam ON public.cbt_session_violations(exam_id);

ALTER TABLE public.cbt_session_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students log own violations"
  ON public.cbt_session_violations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cbt_exam_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Teachers view violations of their exams"
  ON public.cbt_session_violations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cbt_exams e
      WHERE e.id = exam_id AND (
        e.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.cbt_exam_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Teachers delete violations"
  ON public.cbt_session_violations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.cbt_exams e
      WHERE e.id = exam_id AND (
        e.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)
      )
    )
  );