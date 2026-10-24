-- Notifikasi WA kini dipicu saat SPPD dibuat (bukan polling bot tiap menit).
-- Pencatat penerima berpindah dari surat tugas ke SPPD; tabel lama (migrasi 20261024120000) dibuang.
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS assignment_wa_enabled boolean NOT NULL DEFAULT true;

DROP TABLE IF EXISTS public.assignment_wa_notified;

CREATE TABLE IF NOT EXISTS public.travel_wa_notified (
  official_travel_id uuid NOT NULL REFERENCES public.official_travel_letters(id) ON DELETE CASCADE,
  person_key text NOT NULL,            -- 'teacher:<id>' atau 'staff:<id>'
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (official_travel_id, person_key)
);
-- Hanya dipakai bot (service role); tanpa policy = tidak bisa diakses dari aplikasi.
ALTER TABLE public.travel_wa_notified ENABLE ROW LEVEL SECURITY;
