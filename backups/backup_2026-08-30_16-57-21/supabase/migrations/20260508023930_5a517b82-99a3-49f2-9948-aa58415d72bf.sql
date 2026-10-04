
ALTER TABLE public.cbt_questions DROP CONSTRAINT IF EXISTS cbt_questions_correct_answer_check;
ALTER TABLE public.cbt_questions ADD CONSTRAINT cbt_questions_correct_answer_check
  CHECK (correct_answer = ANY (ARRAY['A','B','C','D','E','ESSAY']));
