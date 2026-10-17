-- Role baru untuk staf (tata usaha & karyawan lain) yang punya akun sendiri.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staf';
