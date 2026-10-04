-- ============================================
-- WEEKEND SHIFT (PIKET SABTU MINGGU) PAYMENTS
-- ============================================

-- Tarif piket sabtu minggu
CREATE TABLE IF NOT EXISTS public.weekend_shift_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_type TEXT NOT NULL,
  daily_rate NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(position_type)
);

-- Batch kwitansi piket sabtu minggu
CREATE TABLE IF NOT EXISTS public.weekend_shift_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  receipt_date DATE NOT NULL,
  job_title TEXT NOT NULL,
  description TEXT,
  total_gross NUMERIC NOT NULL DEFAULT 0,
  total_tax NUMERIC NOT NULL DEFAULT 0,
  total_net NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_type TEXT DEFAULT 'pph21' CHECK (tax_type IN ('pph21', 'pph22', 'pph23', 'ppn', 'none')),
  shift_type TEXT DEFAULT 'sabtu_minggu',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Detail petugas piket per batch
CREATE TABLE IF NOT EXISTS public.weekend_shift_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.weekend_shift_batches(id) ON DELETE CASCADE,
  worker_name TEXT NOT NULL,
  position_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  shift_count INTEGER NOT NULL,
  daily_rate NUMERIC NOT NULL,
  gross_amount NUMERIC NOT NULL,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekend_shift_payments_batch ON public.weekend_shift_payments(batch_id);

-- RLS
ALTER TABLE public.weekend_shift_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekend_shift_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekend_shift_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view weekend shift rates" ON public.weekend_shift_rates;
CREATE POLICY "Authenticated can view weekend shift rates"
  ON public.weekend_shift_rates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Bendahara/Admin can manage weekend shift rates" ON public.weekend_shift_rates;
CREATE POLICY "Bendahara/Admin can manage weekend shift rates"
  ON public.weekend_shift_rates FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('bendahara', 'admin', 'super_admin')
  ));

DROP POLICY IF EXISTS "Authenticated can view weekend shift batches" ON public.weekend_shift_batches;
CREATE POLICY "Authenticated can view weekend shift batches"
  ON public.weekend_shift_batches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Bendahara/Admin can manage weekend shift batches" ON public.weekend_shift_batches;
CREATE POLICY "Bendahara/Admin can manage weekend shift batches"
  ON public.weekend_shift_batches FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('bendahara', 'admin', 'super_admin')
  ));

DROP POLICY IF EXISTS "Authenticated can view weekend shift payments" ON public.weekend_shift_payments;
CREATE POLICY "Authenticated can view weekend shift payments"
  ON public.weekend_shift_payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Bendahara/Admin can manage weekend shift payments" ON public.weekend_shift_payments;
CREATE POLICY "Bendahara/Admin can manage weekend shift payments"
  ON public.weekend_shift_payments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('bendahara', 'admin', 'super_admin')
  ));

-- Triggers
DROP TRIGGER IF EXISTS update_weekend_shift_rates_updated_at ON public.weekend_shift_rates;
CREATE TRIGGER update_weekend_shift_rates_updated_at
  BEFORE UPDATE ON public.weekend_shift_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_weekend_shift_batches_updated_at ON public.weekend_shift_batches;
CREATE TRIGGER update_weekend_shift_batches_updated_at
  BEFORE UPDATE ON public.weekend_shift_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default rates
INSERT INTO public.weekend_shift_rates (position_type, daily_rate, description) VALUES
  ('Koordinator Piket', 100000, 'Koordinator piket sabtu minggu'),
  ('Petugas Piket', 75000, 'Petugas piket sabtu minggu reguler'),
  ('Petugas Pengganti', 60000, 'Petugas pengganti/cadangan')
ON CONFLICT (position_type) DO NOTHING;
