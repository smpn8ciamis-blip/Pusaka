ALTER TABLE public.cash_audit_sk_settings
  ADD COLUMN IF NOT EXISTS bendahara_name TEXT,
  ADD COLUMN IF NOT EXISTS bendahara_nip TEXT,
  ADD COLUMN IF NOT EXISTS headmaster_name TEXT,
  ADD COLUMN IF NOT EXISTS headmaster_nip TEXT,
  ADD COLUMN IF NOT EXISTS headmaster_position TEXT;

ALTER TABLE public.cbt_exams
  ADD COLUMN IF NOT EXISTS class_ids UUID[];