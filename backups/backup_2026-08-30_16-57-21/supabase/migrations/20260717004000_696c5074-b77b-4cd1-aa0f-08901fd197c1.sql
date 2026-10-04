
ALTER TABLE public.extracurricular_types ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS instagram_access_token text,
  ADD COLUMN IF NOT EXISTS instagram_user_id text,
  ADD COLUMN IF NOT EXISTS instagram_auto_fetch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS instagram_cache jsonb,
  ADD COLUMN IF NOT EXISTS instagram_cache_at timestamptz;

-- Allow authenticated admins to manage extracurricular_types via RLS if not yet
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='extracurricular_types' AND policyname='ekskul_public_read'
  ) THEN
    CREATE POLICY ekskul_public_read ON public.extracurricular_types
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

GRANT SELECT ON public.extracurricular_types TO anon;
