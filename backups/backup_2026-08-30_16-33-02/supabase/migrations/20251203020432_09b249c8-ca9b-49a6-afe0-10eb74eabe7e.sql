-- Add pangkat_golongan and jabatan columns to teachers table
ALTER TABLE public.teachers 
ADD COLUMN pangkat_golongan text,
ADD COLUMN jabatan text;