-- Pengingat absensi ke WALI KELAS + notifikasi WA absensi petugas piket (mesin fingerprint)
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS homeroom_att_reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homeroom_att_reminder_times text NOT NULL DEFAULT '08:30',
  ADD COLUMN IF NOT EXISTS piket_wa_enabled boolean NOT NULL DEFAULT true;
