-- Surat Pengantar (tata usaha / admin): tabel, pengaturan pola nomor, RPC nomor berikutnya.
-- Aman dijalankan ulang.

-- 1. Pengaturan per sekolah ---------------------------------------------------
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS surat_pengantar_pattern text;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS surat_pengantar_place text;

-- 2. Hak akses -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sp_can_use()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tata_usaha') OR public.is_super_admin())
$$;
REVOKE ALL ON FUNCTION public._sp_can_use() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._sp_can_use() TO authenticated;

-- 3. Tabel surat pengantar -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.surat_pengantar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid,
  nomor_surat text NOT NULL CHECK (char_length(btrim(nomor_surat)) BETWEEN 1 AND 100),
  nomor_urut integer,                         -- nomor urut hasil pola (NULL bila nomor diketik bebas)
  nomor_tahun integer NOT NULL,               -- tahun dari tanggal surat (untuk penomoran per tahun)
  tanggal_surat date NOT NULL DEFAULT CURRENT_DATE,
  tempat_surat text,                          -- mis. "Ciamis"
  kepada_yth text NOT NULL CHECK (char_length(btrim(kepada_yth)) > 0),  -- boleh beberapa baris
  di_tempat text,                             -- mis. "Kraksaan"
  items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),  -- [{uraian, jumlah, keterangan}]
  penandatangan_nama text,                    -- salinan nama KS saat surat dibuat
  penandatangan_nip text,
  catatan text,                               -- catatan internal (tidak dicetak)
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_surat_pengantar_nomor
  ON public.surat_pengantar (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nomor_surat)));
CREATE INDEX IF NOT EXISTS idx_surat_pengantar_tanggal ON public.surat_pengantar (tanggal_surat DESC);
CREATE INDEX IF NOT EXISTS idx_surat_pengantar_tahun_urut ON public.surat_pengantar (nomor_tahun, nomor_urut);

DROP TRIGGER IF EXISTS auto_set_school_id_surat_pengantar ON public.surat_pengantar;
CREATE TRIGGER auto_set_school_id_surat_pengantar BEFORE INSERT ON public.surat_pengantar
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

DROP TRIGGER IF EXISTS update_surat_pengantar_updated_at ON public.surat_pengantar;
CREATE TRIGGER update_surat_pengantar_updated_at BEFORE UPDATE ON public.surat_pengantar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.surat_pengantar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_isolation_surat_pengantar" ON public.surat_pengantar;
CREATE POLICY "school_isolation_surat_pengantar" ON public.surat_pengantar
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "surat_pengantar_manage" ON public.surat_pengantar;
CREATE POLICY "surat_pengantar_manage" ON public.surat_pengantar
  FOR ALL TO authenticated
  USING (public._sp_can_use())
  WITH CHECK (public._sp_can_use());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.surat_pengantar TO authenticated;

-- 4. Pengaturan (baca & simpan) --------------------------------------------------
CREATE OR REPLACE FUNCTION public.surat_pengantar_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.school_settings;
BEGIN
  IF NOT public._sp_can_use() THEN RAISE EXCEPTION 'Tidak berhak'; END IF;
  SELECT * INTO r FROM public.school_settings WHERE id = public._mm_settings_id();
  RETURN jsonb_build_object(
    'pattern', coalesce(nullif(btrim(r.surat_pengantar_pattern), ''), '800/{URUT:3}/{TAHUN}'),
    'place', coalesce(r.surat_pengantar_place, '')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.surat_pengantar_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surat_pengantar_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.surat_pengantar_save_settings(p_pattern text, p_place text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := public._mm_settings_id();
  v_pat text := btrim(coalesce(p_pattern, ''));
  v_place text := nullif(btrim(coalesce(p_place, '')), '');
BEGIN
  IF NOT public._sp_can_use() THEN RAISE EXCEPTION 'Tidak berhak'; END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Pengaturan sekolah belum dibuat'; END IF;
  IF v_pat = '' OR char_length(v_pat) > 80 THEN RAISE EXCEPTION 'Pola nomor harus 1-80 karakter'; END IF;
  IF (SELECT count(*) FROM regexp_matches(v_pat, '\{URUT(?::[0-9]{1,2})?\}', 'g')) <> 1 THEN
    RAISE EXCEPTION 'Pola nomor harus memuat tepat satu {URUT} atau {URUT:n}';
  END IF;
  IF regexp_replace(v_pat, '\{(TAHUN|YY|BULAN|ROMAWI|URUT(:[0-9]{1,2})?)\}', '', 'g') ~ '[{}]' THEN
    RAISE EXCEPTION 'Pola nomor memuat token yang tidak dikenal';
  END IF;
  IF v_place IS NOT NULL AND char_length(v_place) > 60 THEN RAISE EXCEPTION 'Tempat surat maksimal 60 karakter'; END IF;
  UPDATE public.school_settings SET surat_pengantar_pattern = v_pat, surat_pengantar_place = v_place WHERE id = v_id;
  RETURN jsonb_build_object('pattern', v_pat, 'place', coalesce(v_place, ''));
END;
$$;
REVOKE ALL ON FUNCTION public.surat_pengantar_save_settings(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surat_pengantar_save_settings(text, text) TO authenticated;

-- 5. Nomor urut berikutnya untuk satu tahun -----------------------------------------
CREATE OR REPLACE FUNCTION public.surat_pengantar_next(p_year integer)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._sp_can_use() THEN RAISE EXCEPTION 'Tidak berhak'; END IF;
  RETURN coalesce((
    SELECT max(nomor_urut) FROM public.surat_pengantar
     WHERE nomor_tahun = p_year
       AND school_id IS NOT DISTINCT FROM public.get_user_school_id()
  ), 0) + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.surat_pengantar_next(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surat_pengantar_next(integer) TO authenticated;
