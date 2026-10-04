-- Add is_spj column to payment_receipts table
ALTER TABLE public.payment_receipts 
ADD COLUMN IF NOT EXISTS is_spj boolean NOT NULL DEFAULT false;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_payment_receipts_is_spj ON public.payment_receipts(is_spj);