-- Allow Bendahara BOS and Tata Usaha to view all profiles (teacher names)
CREATE POLICY "Bendahara and TU can view profiles"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'bendahara'::app_role)
  OR has_role(auth.uid(), 'tata_usaha'::app_role)
);