-- Saklar halaman publik "Guru & Staff" (guru dan tata usaha). Default: disembunyikan.
ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS show_guru_page boolean NOT NULL DEFAULT false;
