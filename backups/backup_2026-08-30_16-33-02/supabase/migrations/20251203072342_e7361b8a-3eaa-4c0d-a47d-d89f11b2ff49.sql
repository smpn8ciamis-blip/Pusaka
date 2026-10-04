-- Add recipient_nip to payment_receipts table
ALTER TABLE public.payment_receipts 
ADD COLUMN IF NOT EXISTS recipient_nip text;