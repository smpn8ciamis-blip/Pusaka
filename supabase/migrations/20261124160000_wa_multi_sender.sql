-- Nomor WhatsApp pengirim tambahan: beban notifikasi presensi orang tua dibagi ke beberapa nomor.
-- Jalankan sekali di SQL Editor. Aman dijalankan ulang. Tidak mengubah data yang sudah ada.
--
-- Daftar nomor tambahan itu sendiri disimpan di server bot (berkas wa_senders.json + folder baileys_auth_*),
-- bukan di basis data, karena berisi sesi login WhatsApp. Di sini hanya saklar pengaturannya:
--   multi_sender_use_primary      : nomor utama ikut menerima bagian notifikasi (bawaan ya)
--   multi_sender_daily_cap        : batas notifikasi per nomor tambahan per hari (0 = tanpa batas)
--   multi_sender_autoreply        : nomor tambahan membalas chat masuk dengan arahan ke nomor utama
--   fingerprint_parent_wa_enabled : WA presensi ke orang tua saat siswa absen lewat mesin fingerprint (bawaan MATI)

ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS multi_sender_use_primary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS multi_sender_daily_cap integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS multi_sender_autoreply boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fingerprint_parent_wa_enabled boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
