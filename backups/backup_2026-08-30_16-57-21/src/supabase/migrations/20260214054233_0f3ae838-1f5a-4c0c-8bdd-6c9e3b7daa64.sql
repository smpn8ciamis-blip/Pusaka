
-- Fix the function to not block SELECT queries that happen to contain column names like delete_rule, update_rule
CREATE OR REPLACE FUNCTION public.exec_sql_readonly(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  first_word text;
BEGIN
  -- Get first non-whitespace word
  first_word := upper(trim(split_part(trim(sql_query), ' ', 1)));
  
  -- Only allow SELECT queries
  IF first_word != 'SELECT' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  -- Block semicolons (prevent multi-statement attacks)
  IF sql_query LIKE '%;%' THEN
    RAISE EXCEPTION 'Multiple statements are not allowed';
  END IF;

  -- Execute and return as JSON
  EXECUTE 'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || sql_query || ') t'
  INTO result;
  
  RETURN result;
END;
$$;
