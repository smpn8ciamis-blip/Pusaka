ALTER TABLE public.cash_audit_sk_settings 
ADD COLUMN IF NOT EXISTS sk_period_start_month INTEGER,
ADD COLUMN IF NOT EXISTS sk_period_start_year INTEGER,
ADD COLUMN IF NOT EXISTS sk_period_end_month INTEGER,
ADD COLUMN IF NOT EXISTS sk_period_end_year INTEGER;