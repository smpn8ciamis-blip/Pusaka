
CREATE OR REPLACE FUNCTION public.exec_sql_readonly(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
DECLARE
  result jsonb;
  cleaned_query text;
  first_word text;
BEGIN
  -- Remove all leading/trailing whitespace including newlines and tabs
  cleaned_query := regexp_replace(sql_query, E'^[\\s]+', '', 'g');
  cleaned_query := regexp_replace(cleaned_query, E'[\\s]+$', '', 'g');
  
  first_word := upper(split_part(cleaned_query, ' ', 1));
  
  IF first_word != 'SELECT' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed. Got: %', first_word;
  END IF;
  
  IF cleaned_query LIKE '%;%' THEN
    RAISE EXCEPTION 'Multiple statements are not allowed';
  END IF;

  EXECUTE 'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || sql_query || ') t'
  INTO result;
  
  RETURN result;
END;
$$;
