-- Allow Tata Usaha to view teachers for assignment letters
CREATE POLICY "Tata Usaha can view teachers"
ON teachers FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Allow Tata Usaha to view profiles for assignment letters
CREATE POLICY "Tata Usaha can view profiles"
ON profiles FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'tata_usaha'::app_role));