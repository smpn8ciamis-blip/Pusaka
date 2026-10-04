-- Enable PostgREST joins from teachers -> profiles by adding a FK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teachers_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.teachers
    ADD CONSTRAINT teachers_user_id_profiles_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.profiles(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
  END IF;
END $$;

-- Index for faster lookups/joins
CREATE INDEX IF NOT EXISTS idx_teachers_user_id ON public.teachers(user_id);