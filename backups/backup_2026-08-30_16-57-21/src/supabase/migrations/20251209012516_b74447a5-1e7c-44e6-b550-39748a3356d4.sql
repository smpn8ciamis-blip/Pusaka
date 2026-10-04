-- Add SELECT policies for tata_usaha on assignment_letters
CREATE POLICY "Tata Usaha can view assignment letters"
ON public.assignment_letters
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add SELECT policies for tata_usaha on assignment_letter_teachers
CREATE POLICY "Tata Usaha can view assignment letter teachers"
ON public.assignment_letter_teachers
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add SELECT policies for tata_usaha on assignment_letter_manual_executors
CREATE POLICY "Tata Usaha can view assignment letter manual executors"
ON public.assignment_letter_manual_executors
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add SELECT policies for tata_usaha on official_travel_letters
CREATE POLICY "Tata Usaha can view official travel letters"
ON public.official_travel_letters
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add SELECT policies for tata_usaha on official_travel_teachers
CREATE POLICY "Tata Usaha can view official travel teachers"
ON public.official_travel_teachers
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add SELECT policies for tata_usaha on official_travel_followers
CREATE POLICY "Tata Usaha can view official travel followers"
ON public.official_travel_followers
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add SELECT policies for tata_usaha on payment_receipts
CREATE POLICY "Tata Usaha can view payment receipts"
ON public.payment_receipts
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add SELECT policies for tata_usaha on travel_payment_rates
CREATE POLICY "Tata Usaha can view travel payment rates"
ON public.travel_payment_rates
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));