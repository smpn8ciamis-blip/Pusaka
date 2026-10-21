-- Penerimaan sekolah (BOS, komite, APBD, dll.) per tahun anggaran.
-- Dipakai di Anggaran Penjab untuk menghitung selisih: penerimaan dikurangi total anggaran belanja seluruh penjab.

CREATE TABLE IF NOT EXISTS public.snp_school_revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id),
  fiscal_year text NOT NULL,
  source text NOT NULL,                       -- sumber dana, mis. "BOS Reguler"
  description text,
  amount numeric NOT NULL CHECK (amount >= 0),
  month integer CHECK (month IS NULL OR (month BETWEEN 1 AND 12)),   -- bulan perkiraan diterima
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snp_school_revenues_year_idx ON public.snp_school_revenues(fiscal_year);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.snp_school_revenues TO authenticated;
GRANT ALL ON public.snp_school_revenues TO service_role;
ALTER TABLE public.snp_school_revenues ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS auto_set_school_id_snp_school_revenues ON public.snp_school_revenues;
CREATE TRIGGER auto_set_school_id_snp_school_revenues BEFORE INSERT ON public.snp_school_revenues
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
DROP TRIGGER IF EXISTS update_snp_school_revenues_updated_at ON public.snp_school_revenues;
CREATE TRIGGER update_snp_school_revenues_updated_at BEFORE UPDATE ON public.snp_school_revenues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "school_isolation_snp_school_revenues" ON public.snp_school_revenues;
CREATE POLICY "school_isolation_snp_school_revenues" ON public.snp_school_revenues AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

-- Admin, bendahara, dan super admin mengelola penerimaan
DROP POLICY IF EXISTS "snp_school_revenues_finance" ON public.snp_school_revenues;
CREATE POLICY "snp_school_revenues_finance" ON public.snp_school_revenues FOR ALL TO authenticated
  USING (public.is_snp_finance()) WITH CHECK (public.is_snp_finance());
