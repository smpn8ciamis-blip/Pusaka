-- Notifikasi WA surat tugas: saklar + pencatat siapa yang sudah dinotifikasi (agar tidak terkirim dobel).
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS assignment_wa_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.assignment_wa_notified (
  assignment_letter_id uuid NOT NULL REFERENCES public.assignment_letters(id) ON DELETE CASCADE,
  person_key text NOT NULL,            -- 'teacher:<id>' atau 'staff:<id>' (stabil walau pelaksana disimpan ulang saat surat diedit)
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_letter_id, person_key)
);
-- Hanya dipakai bot (service role); tanpa policy = tidak bisa diakses dari aplikasi.
ALTER TABLE public.assignment_wa_notified ENABLE ROW LEVEL SECURITY;
