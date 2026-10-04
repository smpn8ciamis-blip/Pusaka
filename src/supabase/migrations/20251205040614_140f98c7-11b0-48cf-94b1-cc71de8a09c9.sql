-- Add new columns to rkas_items for better categorization
ALTER TABLE public.rkas_items 
ADD COLUMN IF NOT EXISTS main_category text,
ADD COLUMN IF NOT EXISTS sub_category text,
ADD COLUMN IF NOT EXISTS kode_rekening text,
ADD COLUMN IF NOT EXISTS kode_kegiatan text;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_rkas_items_main_category ON public.rkas_items(main_category);