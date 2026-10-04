
-- Fix school isolation: Change all school_isolation policies from PERMISSIVE to RESTRICTIVE
-- RESTRICTIVE policies use AND with other policies, ensuring school_id filtering is always enforced

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND policyname LIKE 'school_isolation_%'
  LOOP
    -- Drop the old permissive policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    
    -- Recreate as RESTRICTIVE for ALL operations
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((school_id IS NULL) OR (school_id = get_user_school_id()) OR is_super_admin()) WITH CHECK ((school_id IS NULL) OR (school_id = get_user_school_id()) OR is_super_admin())',
      r.policyname, r.schemaname, r.tablename
    );
  END LOOP;
END $$;
