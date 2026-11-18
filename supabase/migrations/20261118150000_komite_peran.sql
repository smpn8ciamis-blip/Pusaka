-- Peran baru untuk penggalangan dana Komite:
--   bendahara_komite : mengelola SEMUA data halaman Komite (target, rekening, pendapatan, korlas)
--   korlas           : koordinator kelas; hanya menginput sumbangan siswa dari tingkat kelasnya
-- JALANKAN BERKAS INI DULU, TERPISAH, lalu jalankan 20261118150100_komite_dana.sql
-- (nilai enum baru tidak boleh dipakai dalam transaksi yang sama dengan ALTER TYPE ... ADD VALUE).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bendahara_komite';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'korlas';
