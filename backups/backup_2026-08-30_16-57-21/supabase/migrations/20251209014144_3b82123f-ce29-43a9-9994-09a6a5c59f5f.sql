-- Add INSERT policies for tata_usaha on assignment_letters
CREATE POLICY "Tata Usaha can insert assignment letters"
ON public.assignment_letters
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add INSERT policies for tata_usaha on assignment_letter_teachers
CREATE POLICY "Tata Usaha can insert assignment letter teachers"
ON public.assignment_letter_teachers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add INSERT policies for tata_usaha on assignment_letter_manual_executors
CREATE POLICY "Tata Usaha can insert assignment letter manual executors"
ON public.assignment_letter_manual_executors
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add INSERT policies for tata_usaha on official_travel_letters
CREATE POLICY "Tata Usaha can insert official travel letters"
ON public.official_travel_letters
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add INSERT policies for tata_usaha on official_travel_teachers
CREATE POLICY "Tata Usaha can insert official travel teachers"
ON public.official_travel_teachers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add INSERT policies for tata_usaha on official_travel_followers
CREATE POLICY "Tata Usaha can insert official travel followers"
ON public.official_travel_followers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add UPDATE policies for tata_usaha
CREATE POLICY "Tata Usaha can update assignment letters"
ON public.assignment_letters
FOR UPDATE
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Tata Usaha can update official travel letters"
ON public.official_travel_letters
FOR UPDATE
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Add DELETE policies for tata_usaha
CREATE POLICY "Tata Usaha can delete assignment letter teachers"
ON public.assignment_letter_teachers
FOR DELETE
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Tata Usaha can delete assignment letter manual executors"
ON public.assignment_letter_manual_executors
FOR DELETE
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Tata Usaha can delete official travel teachers"
ON public.official_travel_teachers
FOR DELETE
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Tata Usaha can delete official travel followers"
ON public.official_travel_followers
FOR DELETE
USING (has_role(auth.uid(), 'tata_usaha'::app_role));