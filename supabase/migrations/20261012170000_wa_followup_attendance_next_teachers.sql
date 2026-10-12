-- Saklar: apakah guru jam berikutnya (jam ke-2 dst pada kelas yang sama) tetap diingatkan mengisi absensi
-- walau absensi kelas itu sudah diisi guru sebelumnya pada hari yang sama.
-- true  = tetap diingatkan (perilaku lama); false = tidak diingatkan bila kelas sudah terabsen.
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS followup_attendance_next_teachers boolean NOT NULL DEFAULT true;
