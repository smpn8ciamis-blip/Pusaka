-- Add program and sub_program columns to kode_kegiatan_labels
ALTER TABLE public.kode_kegiatan_labels 
ADD COLUMN IF NOT EXISTS program text,
ADD COLUMN IF NOT EXISTS sub_program text;

-- Migrate existing keterangan data to program column
UPDATE public.kode_kegiatan_labels 
SET program = keterangan 
WHERE program IS NULL AND keterangan IS NOT NULL;