-- Add DELETE policy for Tata Usaha on assignment_letters
CREATE POLICY "Tata Usaha can delete assignment letters"
ON public.assignment_letters
FOR DELETE
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add DELETE policy for Tata Usaha on official_travel_letters
CREATE POLICY "Tata Usaha can delete official travel letters"
ON public.official_travel_letters
FOR DELETE
USING (has_role(auth.uid(), 'tata_usaha'::app_role));