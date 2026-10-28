-- Saklar notifikasi WA ke orang tua saat siswa mendapat catatan pelanggaran baru.
-- Aman dijalankan ulang. Bawaan: aktif.
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS violation_wa_enabled boolean NOT NULL DEFAULT true;
