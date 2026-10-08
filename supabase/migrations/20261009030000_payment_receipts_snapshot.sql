-- Bekukan rincian kwitansi SPPD (tarif per orang x hari) saat kwitansi disimpan,
-- agar angka tidak berubah ketika tarif di pengaturan diubah kemudian.
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS line_items jsonb,
  ADD COLUMN IF NOT EXISTS travel_days integer;

COMMENT ON COLUMN public.payment_receipts.line_items IS
  'Snapshot baris kwitansi kolektif: [{kind, full_name, id_number, jabatan, class_name, rate, days, amount}]';
