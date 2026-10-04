ALTER TABLE public.student_mutations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.student_mutations ALTER COLUMN created_by SET DEFAULT auth.uid();