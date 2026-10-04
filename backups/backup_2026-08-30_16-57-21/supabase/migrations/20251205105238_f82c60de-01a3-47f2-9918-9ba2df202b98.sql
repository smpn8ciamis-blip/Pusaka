-- Add permissive SELECT policy for Bendahara on official_travel_letters
CREATE POLICY "Bendahara can view official travel letters for receipt" 
ON public.official_travel_letters 
FOR SELECT 
USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Add permissive SELECT policy for Bendahara on official_travel_teachers
CREATE POLICY "Bendahara can view official travel teachers for receipt" 
ON public.official_travel_teachers 
FOR SELECT 
USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Add permissive SELECT policy for Bendahara on official_travel_followers
CREATE POLICY "Bendahara can view official travel followers for receipt" 
ON public.official_travel_followers 
FOR SELECT 
USING (has_role(auth.uid(), 'bendahara'::app_role));