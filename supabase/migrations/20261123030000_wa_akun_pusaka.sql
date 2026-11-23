-- Siswa/orang tua dapat mengetik "akun pusaka" ke bot WA untuk menerima username dan password awal.
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS student_account_wa_enabled boolean NOT NULL DEFAULT true;
