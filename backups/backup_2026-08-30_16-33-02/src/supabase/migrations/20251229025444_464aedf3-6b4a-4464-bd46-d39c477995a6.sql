-- Recreate pg_net extension in a non-public schema to satisfy linter
-- Note: pg_net doesn't support ALTER EXTENSION ... SET SCHEMA.
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    DROP EXTENSION pg_net CASCADE;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;