-- Uji kemampuan server (halaman admin "Uji Server"): fungsi ringan yang mewakili beban CBT.
-- Hanya admin / super admin. Data uji disimpan di tabel kecil yang otomatis dirapikan.

CREATE TABLE IF NOT EXISTS public.server_probe_log (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  payload text
);
CREATE INDEX IF NOT EXISTS idx_server_probe_log_created ON public.server_probe_log (created_at);
ALTER TABLE public.server_probe_log ENABLE ROW LEVEL SECURITY;   -- tanpa kebijakan: hanya lewat fungsi di bawah

CREATE OR REPLACE FUNCTION public._probe_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya admin' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._probe_guard() FROM PUBLIC, anon, authenticated;

-- Ping: hanya autentikasi + satu kueri kecil (mewakili cbt_student_exams / cek status)
CREATE OR REPLACE FUNCTION public.server_probe_ping()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._probe_guard();
  RETURN jsonb_build_object('ok', true, 'students', (SELECT count(*) FROM public.students));
END;
$$;

-- Baca: balasan berukuran p_kb KB (mewakili memuat soal saat siswa menekan Mulai)
CREATE OR REPLACE FUNCTION public.server_probe_read(p_kb integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._probe_guard();
  RETURN jsonb_build_object('ok', true, 'data', repeat(md5(random()::text), GREATEST(1, LEAST(p_kb, 500)) * 32));
END;
$$;

-- Tulis: sisipkan beberapa baris (mewakili simpan jawaban). Rapikan data lama sesekali.
CREATE OR REPLACE FUNCTION public.server_probe_write(p_rows integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := GREATEST(1, LEAST(p_rows, 50));
BEGIN
  PERFORM public._probe_guard();
  INSERT INTO public.server_probe_log (payload)
  SELECT repeat('x', 200) FROM generate_series(1, n);
  IF random() < 0.02 THEN
    DELETE FROM public.server_probe_log WHERE created_at < now() - interval '10 minutes';
  END IF;
  RETURN jsonb_build_object('ok', true, 'rows', n);
END;
$$;

-- Informasi server untuk dibaca admin
CREATE OR REPLACE FUNCTION public.server_probe_info()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hit numeric; v_conn integer; v_active integer; v_max integer;
BEGIN
  PERFORM public._probe_guard();
  SELECT CASE WHEN blks_hit + blks_read > 0 THEN round(100.0 * blks_hit / (blks_hit + blks_read), 1) END
    INTO v_hit FROM pg_stat_database WHERE datname = current_database();
  SELECT count(*), count(*) FILTER (WHERE state = 'active') INTO v_conn, v_active FROM pg_stat_activity;
  v_max := current_setting('max_connections')::integer;
  RETURN jsonb_build_object(
    'version', split_part(version(), ' ', 2),
    'db_size_mb', round(pg_database_size(current_database()) / 1048576.0, 0),
    'connections', v_conn, 'active', v_active, 'max_connections', v_max,
    'cache_hit_pct', v_hit,
    'uptime_hours', round(extract(epoch FROM now() - pg_postmaster_start_time()) / 3600.0, 1),
    'shared_buffers', current_setting('shared_buffers'),
    'students', (SELECT count(*) FROM public.students WHERE COALESCE(status, 'aktif') = 'aktif')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.server_probe_cleanup()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._probe_guard();
  DELETE FROM public.server_probe_log;
END;
$$;

REVOKE ALL ON FUNCTION public.server_probe_ping(), public.server_probe_read(integer), public.server_probe_write(integer),
  public.server_probe_info(), public.server_probe_cleanup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.server_probe_ping(), public.server_probe_read(integer), public.server_probe_write(integer),
  public.server_probe_info(), public.server_probe_cleanup() TO authenticated;
