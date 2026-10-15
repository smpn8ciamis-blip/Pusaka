-- Ucapan akhir pekan via WhatsApp untuk guru yang tidak mengajar hari Sabtu
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS saturday_greeting_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS saturday_greeting_time text NOT NULL DEFAULT '07:00';
