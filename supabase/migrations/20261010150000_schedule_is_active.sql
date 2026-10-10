-- Jadwal tidak dihapus lagi, cukup dinonaktifkan agar data absensi/jurnal/nilai tetap aman
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_schedules_is_active ON public.schedules(is_active);
