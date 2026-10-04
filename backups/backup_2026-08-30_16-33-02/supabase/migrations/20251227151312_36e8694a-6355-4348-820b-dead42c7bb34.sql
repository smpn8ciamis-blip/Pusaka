
-- Create table for cash audit records
CREATE TABLE public.cash_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sk_number TEXT,
  sk_date DATE,
  total_penerimaan NUMERIC NOT NULL DEFAULT 0,
  total_pengeluaran NUMERIC NOT NULL DEFAULT 0,
  saldo_buku NUMERIC GENERATED ALWAYS AS (total_penerimaan - total_pengeluaran) STORED,
  -- Paper money counts
  lembar_100000 INTEGER NOT NULL DEFAULT 0,
  lembar_50000 INTEGER NOT NULL DEFAULT 0,
  lembar_20000 INTEGER NOT NULL DEFAULT 0,
  lembar_10000 INTEGER NOT NULL DEFAULT 0,
  lembar_5000 INTEGER NOT NULL DEFAULT 0,
  lembar_2000 INTEGER NOT NULL DEFAULT 0,
  lembar_1000 INTEGER NOT NULL DEFAULT 0,
  -- Coin counts
  keping_1000 INTEGER NOT NULL DEFAULT 0,
  keping_500 INTEGER NOT NULL DEFAULT 0,
  keping_200 INTEGER NOT NULL DEFAULT 0,
  keping_100 INTEGER NOT NULL DEFAULT 0,
  -- Bank and securities
  saldo_bank NUMERIC NOT NULL DEFAULT 0,
  surat_berharga NUMERIC NOT NULL DEFAULT 0,
  -- Explanation
  penjelasan_perbedaan TEXT,
  -- Metadata
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cash_audits ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage cash audits"
  ON public.cash_audits
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage cash audits"
  ON public.cash_audits
  FOR ALL
  USING (has_role(auth.uid(), 'bendahara'::app_role))
  WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));
