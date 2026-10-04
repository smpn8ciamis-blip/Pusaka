-- Add RLS policy for Bendahara to manage official_travel_followers
-- This fixes the issue where manual executors are not saved when SPD is created by Bendahara

CREATE POLICY "Bendahara can manage official travel followers"
ON public.official_travel_followers
FOR ALL
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));