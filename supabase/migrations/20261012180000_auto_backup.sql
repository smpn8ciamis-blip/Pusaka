-- Auto backup database + isi bucket ke Google Drive (dijalankan oleh bot di server, sesuai jadwal).
CREATE TABLE IF NOT EXISTS public.backup_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  schedule_time text NOT NULL DEFAULT '02:00',                 -- jam WIB, format HH:MM
  days integer[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',           -- hari (ISO: 1=Senin ... 7=Minggu)
  include_db boolean NOT NULL DEFAULT true,
  include_storage boolean NOT NULL DEFAULT true,
  keep_count integer NOT NULL DEFAULT 7 CHECK (keep_count BETWEEN 1 AND 90),   -- jumlah backup terakhir yang disimpan di Drive
  drive_folder_id text,                                        -- diisi otomatis oleh bot
  last_run_date date,                                          -- tanggal (WIB) backup terjadwal terakhir dimulai
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.backup_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'manual',                      -- manual | schedule
  status text NOT NULL DEFAULT 'running',                      -- running | success | partial | failed
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  message text,
  details jsonb
);
CREATE INDEX IF NOT EXISTS backup_runs_started_idx ON public.backup_runs(started_at DESC);

ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.backup_settings TO authenticated;
GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_settings, public.backup_runs TO service_role;

DROP POLICY IF EXISTS "Admin kelola backup_settings" ON public.backup_settings;
CREATE POLICY "Admin kelola backup_settings" ON public.backup_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
DROP POLICY IF EXISTS "Admin lihat backup_runs" ON public.backup_runs;
CREATE POLICY "Admin lihat backup_runs" ON public.backup_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
