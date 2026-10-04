-- Add missing RLS policies for tata_usaha to manage travel_payment_rates

-- Allow Tata Usaha to insert travel payment rates
CREATE POLICY "Tata Usaha can insert travel payment rates"
ON public.travel_payment_rates
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'tata_usaha'));

-- Allow Tata Usaha to update travel payment rates
CREATE POLICY "Tata Usaha can update travel payment rates"
ON public.travel_payment_rates
FOR UPDATE
USING (public.has_role(auth.uid(), 'tata_usaha'));

-- Allow Tata Usaha to delete travel payment rates
CREATE POLICY "Tata Usaha can delete travel payment rates"
ON public.travel_payment_rates
FOR DELETE
USING (public.has_role(auth.uid(), 'tata_usaha'));