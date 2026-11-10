-- Pengumuman ke grup WhatsApp: kelas yang absensi jam pertamanya belum terisi pada jam pengecekan
-- (beserta wali kelas dan guru pengajar jam pertama). Grup tujuan = grup di tab "Rekap Grup".
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS unfilled_att_group_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unfilled_att_group_times text NOT NULL DEFAULT '08:30';
