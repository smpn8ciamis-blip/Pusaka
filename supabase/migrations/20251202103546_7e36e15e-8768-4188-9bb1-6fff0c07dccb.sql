-- Add dasar surat tugas fields to assignment_letters table
ALTER TABLE public.assignment_letters
ADD COLUMN dasar_surat_tugas TEXT,
ADD COLUMN tanggal_dasar_surat_tugas DATE;