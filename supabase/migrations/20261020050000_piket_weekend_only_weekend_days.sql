-- Piket Sabtu & Minggu hanya berlaku pada hari Sabtu/Minggu. Absen hari kerja (mis. Senin) tidak boleh tercatat sebagai piket ini.
-- 1) Bersihkan data otomatis yang jatuh pada hari kerja.
DELETE FROM public.piket_unscheduled
 WHERE shift_type = 'sabtu_minggu' AND EXTRACT(DOW FROM duty_date) NOT IN (0, 6);
DELETE FROM public.piket_duties
 WHERE shift_type = 'sabtu_minggu' AND EXTRACT(DOW FROM duty_date) NOT IN (0, 6)
   AND (source = 'fingerprint' OR status = 'dijadwalkan');
-- (Jadwal yang dicatat manual pada hari kerja dibiarkan agar tidak menghapus data admin; aplikasi tidak menghitungnya.
--  Cek: SELECT * FROM public.piket_duties WHERE shift_type='sabtu_minggu' AND EXTRACT(DOW FROM duty_date) NOT IN (0,6);)

-- 2) Cegah data baru pada hari kerja (NOT VALID: baris lama tidak diperiksa ulang).
ALTER TABLE public.piket_duties DROP CONSTRAINT IF EXISTS piket_duties_weekend_days;
ALTER TABLE public.piket_duties ADD CONSTRAINT piket_duties_weekend_days
  CHECK (shift_type <> 'sabtu_minggu' OR EXTRACT(DOW FROM duty_date) IN (0, 6)) NOT VALID;
ALTER TABLE public.piket_unscheduled DROP CONSTRAINT IF EXISTS piket_unscheduled_weekend_days;
ALTER TABLE public.piket_unscheduled ADD CONSTRAINT piket_unscheduled_weekend_days
  CHECK (shift_type <> 'sabtu_minggu' OR EXTRACT(DOW FROM duty_date) IN (0, 6)) NOT VALID;
