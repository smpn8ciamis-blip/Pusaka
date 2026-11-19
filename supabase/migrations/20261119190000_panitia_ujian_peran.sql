-- Peran baru: panitia_ujian (panitia ujian).
--   Mengelola menu Administrasi Ujian (denah ruang, kartu ujian, nomor peserta) serta nama & jadwal ujian.
-- JALANKAN BERKAS INI DULU, TERPISAH, lalu jalankan 20261119190100_panitia_ujian_akses.sql
-- (nilai enum baru tidak boleh dipakai dalam transaksi yang sama dengan ALTER TYPE ... ADD VALUE).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'panitia_ujian';
NOTIFY pgrst, 'reload schema';
