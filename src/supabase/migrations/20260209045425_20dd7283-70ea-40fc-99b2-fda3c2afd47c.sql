-- Function to get database size
CREATE OR REPLACE FUNCTION public.get_database_size()
RETURNS TABLE(db_size bigint, db_size_pretty text) 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT 
    pg_database_size(current_database())::bigint as db_size,
    pg_size_pretty(pg_database_size(current_database())) as db_size_pretty;
END;
$$;

-- Function to get table statistics
CREATE OR REPLACE FUNCTION public.get_table_stats()
RETURNS TABLE(table_name text, row_count bigint, table_size text) 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    t.tablename::text as table_name,
    (SELECT count(*) FROM pg_catalog.pg_class c2 
     JOIN pg_catalog.pg_namespace n ON n.oid = c2.relnamespace 
     WHERE c2.relname = t.tablename AND n.nspname = 'public')::bigint as row_count,
    pg_size_pretty(pg_total_relation_size(quote_ident(t.schemaname) || '.' || quote_ident(t.tablename)))::text as table_size
  FROM pg_tables t
  WHERE t.schemaname = 'public'
  ORDER BY pg_total_relation_size(quote_ident(t.schemaname) || '.' || quote_ident(t.tablename)) DESC;
END;
$$;

-- Function to get connection stats
CREATE OR REPLACE FUNCTION public.get_connection_stats()
RETURNS TABLE(active_connections bigint, max_connections integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT 
    (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')::bigint as active_connections,
    current_setting('max_connections')::integer as max_connections;
END;
$$;

-- Function to get storage stats
CREATE OR REPLACE FUNCTION public.get_storage_stats()
RETURNS TABLE(total_files bigint, total_size bigint, total_size_pretty text, bucket_count bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_files bigint := 0;
  v_total_size bigint := 0;
  v_bucket_count bigint := 0;
BEGIN
  -- Get bucket count
  SELECT count(*) INTO v_bucket_count FROM storage.buckets;
  
  -- Get file stats
  SELECT count(*), COALESCE(sum((metadata->>'size')::bigint), 0)
  INTO v_total_files, v_total_size
  FROM storage.objects;

  RETURN QUERY SELECT 
    v_total_files,
    v_total_size,
    pg_size_pretty(v_total_size) as total_size_pretty,
    v_bucket_count;
END;
$$;
