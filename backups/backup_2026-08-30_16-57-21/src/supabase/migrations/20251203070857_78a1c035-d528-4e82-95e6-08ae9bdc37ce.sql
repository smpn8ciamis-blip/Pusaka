-- Add bendahara columns to payment_receipts table
ALTER TABLE public.payment_receipts 
ADD COLUMN bendahara_name text,
ADD COLUMN bendahara_nip text;