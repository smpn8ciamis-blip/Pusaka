
-- Create a function to execute read-only SQL queries (for database export)
-- This function is restricted to super_admin users only
CREATE OR REPLACE FUNCTION public.exec_sql_readonly(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  normalized text;
BEGIN
  -- Normalize: trim whitespace and convert to uppercase for checking
  normalized := upper(trim(sql_query));
  
  -- Only allow SELECT queries
  IF NOT (normalized LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  -- Block dangerous keywords
  IF normalized LIKE '%INSERT%' OR normalized LIKE '%UPDATE%' OR normalized LIKE '%DELETE%' 
     OR normalized LIKE '%DROP%' OR normalized LIKE '%ALTER%' OR normalized LIKE '%TRUNCATE%'
     OR normalized LIKE '%CREATE%' OR normalized LIKE '%GRANT%' OR normalized LIKE '%REVOKE%' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Execute and return as JSON
  EXECUTE 'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || sql_query || ') t'
  INTO result;
  
  RETURN result;
END;
$$;

-- Revoke from public, only authenticated users can call
REVOKE ALL ON FUNCTION public.exec_sql_readonly(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_sql_readonly(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql_readonly(text) TO service_role;
