
-- Create a secure function to execute read-only SQL for migration export
CREATE OR REPLACE FUNCTION public.exec_sql_readonly(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Only allow SELECT statements
  IF NOT (lower(trim(sql_query)) LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  -- Block dangerous patterns
  IF lower(sql_query) ~ '(insert|update|delete|drop|alter|create|truncate|grant|revoke)' THEN
    RAISE EXCEPTION 'Only read-only queries are allowed';
  END IF;

  EXECUTE 'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || sql_query || ') t'
  INTO result;
  
  RETURN result;
END;
$$;

-- Only allow authenticated users to call this
REVOKE ALL ON FUNCTION public.exec_sql_readonly(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_sql_readonly(text) TO authenticated;
