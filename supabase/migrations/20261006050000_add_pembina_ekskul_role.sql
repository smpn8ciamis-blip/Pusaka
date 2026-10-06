-- Role baru: Pembina Ekstrakurikuler
-- Dipisah dari migrasi berikutnya karena nilai enum baru tidak boleh
-- dipakai dalam transaksi yang sama dengan ALTER TYPE ... ADD VALUE.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'pembina_ekskul';
