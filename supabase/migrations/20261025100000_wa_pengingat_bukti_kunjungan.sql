-- Pengingat WA susulan: pelaksana SPPD yang belum mengunggah foto bukti kunjungan (H+1 setelah tanggal kembali).
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS assignment_followup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS assignment_followup_time text NOT NULL DEFAULT '09:00';

-- Pencatat pengingat yang sudah dikirim (satu kali per orang per SPPD).
CREATE TABLE IF NOT EXISTS public.travel_wa_followup (
  official_travel_id uuid NOT NULL REFERENCES public.official_travel_letters(id) ON DELETE CASCADE,
  person_key text NOT NULL,            -- 'teacher:<id>' atau 'staff:<id>'
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (official_travel_id, person_key)
);
-- Hanya dipakai bot (service role); tanpa policy = tidak bisa diakses dari aplikasi.
ALTER TABLE public.travel_wa_followup ENABLE ROW LEVEL SECURITY;
