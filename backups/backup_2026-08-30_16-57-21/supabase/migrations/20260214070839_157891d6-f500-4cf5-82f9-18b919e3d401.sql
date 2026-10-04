
CREATE OR REPLACE FUNCTION public.exec_sql_readonly(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
DECLARE
  result jsonb;
  first_word text;
BEGIN
  first_word := upper(trim(split_part(trim(sql_query), ' ', 1)));
  
  IF first_word != 'SELECT' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  IF sql_query LIKE '%;%' THEN
    RAISE EXCEPTION 'Multiple statements are not allowed';
  END IF;

  EXECUTE 'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || sql_query || ') t'
  INTO result;
  
  RETURN result;
END;
$$;
