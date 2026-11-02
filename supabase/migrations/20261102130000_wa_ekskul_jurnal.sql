-- Pembina ekskul mengisi jurnal & mengirim foto kegiatan lewat WhatsApp (bot).
-- Saklar di menu WhatsApp Bot. Bot memakai service role (tanpa tabel baru).
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS ekskul_journal_wa_enabled boolean NOT NULL DEFAULT true;

-- Bot mencocokkan nomor pengirim dengan nomor HP profil/staf pembina.
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles (phone) WHERE phone IS NOT NULL;
