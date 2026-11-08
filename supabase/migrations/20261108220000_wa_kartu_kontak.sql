-- Kartu kontak bot WhatsApp: pada chat pertama yang memakai perintah bot, bot mengirim kartu kontak
-- supaya orang tua/guru bisa menyimpan nomor bot di HP mereka.
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS wa_contact_card_enabled boolean NOT NULL DEFAULT true;
