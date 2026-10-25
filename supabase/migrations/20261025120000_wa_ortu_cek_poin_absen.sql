-- Orang tua yang nomor WA-nya sudah tertaut ke NISN dapat mengetik "cek poin" / "absen" ke bot.
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS parent_query_enabled boolean NOT NULL DEFAULT true;
