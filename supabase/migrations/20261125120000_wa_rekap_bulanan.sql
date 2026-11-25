-- Rekap kehadiran siswa bulanan (PDF) otomatis ke grup WhatsApp kelas + grup utama sekolah.
-- Jalankan sekali di SQL Editor. Aman dijalankan ulang. Tidak mengubah data yang sudah ada.
--
--   monthly_recap_enabled      : saklar (bawaan MATI; nyalakan setelah menguji lewat tombol "Kirim uji")
--   monthly_recap_time         : jam kirim pada hari terakhir tiap bulan (WIB), bawaan 16:00
--   monthly_recap_class_groups : kirim PDF tiap kelas ke grup kelasnya (tabel wa_class_groups)
--   monthly_recap_main_group   : kirim PDF gabungan semua rombel ke grup utama (class_recap_group_jid)
--   monthly_recap_paper        : a4 | f4
--   monthly_recap_place        : kota pada titimangsa tanda tangan wali kelas
--   monthly_recap_holidays     : tanggal libur, satu per baris: "2026-11-10 Hari Pahlawan" atau "2026-12-22..2027-01-02 Libur semester"

ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS monthly_recap_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_recap_time text NOT NULL DEFAULT '16:00',
  ADD COLUMN IF NOT EXISTS monthly_recap_class_groups boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS monthly_recap_main_group boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS monthly_recap_paper text NOT NULL DEFAULT 'a4',
  ADD COLUMN IF NOT EXISTS monthly_recap_place text NOT NULL DEFAULT 'Ciamis',
  ADD COLUMN IF NOT EXISTS monthly_recap_holidays text NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
