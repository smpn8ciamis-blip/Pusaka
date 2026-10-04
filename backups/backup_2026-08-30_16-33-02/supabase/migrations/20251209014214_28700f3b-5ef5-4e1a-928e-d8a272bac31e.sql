-- Add INSERT policy for tata_usaha on payment_receipts
CREATE POLICY "Tata Usaha can insert payment receipts"
ON public.payment_receipts
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add UPDATE policy for tata_usaha on payment_receipts
CREATE POLICY "Tata Usaha can update payment receipts"
ON public.payment_receipts
FOR UPDATE
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add DELETE policy for tata_usaha on payment_receipts
CREATE POLICY "Tata Usaha can delete payment receipts"
ON public.payment_receipts
FOR DELETE
USING (has_role(auth.uid(), 'tata_usaha'::app_role));