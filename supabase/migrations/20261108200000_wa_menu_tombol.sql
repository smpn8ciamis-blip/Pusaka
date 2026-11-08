-- Menu perintah bot WhatsApp (ketik MENU) dan tombol asli opsional.
-- wa_menu_enabled   : bot membalas "menu"/salam dengan daftar perintah bernomor untuk ortu & guru.
-- wa_buttons_enabled: kirim juga tombol asli WhatsApp (eksperimental; default mati).
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS wa_menu_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wa_buttons_enabled boolean NOT NULL DEFAULT false;
