-- Drop existing restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Admins can view assignment letters" ON public.assignment_letters;
DROP POLICY IF EXISTS "Tata Usaha can manage assignment letters" ON public.assignment_letters;

-- Create permissive SELECT policy for tata_usaha
CREATE POLICY "Tata Usaha can view assignment letters" 
ON public.assignment_letters 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Create permissive INSERT policy for tata_usaha
CREATE POLICY "Tata Usaha can insert assignment letters" 
ON public.assignment_letters 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Create permissive UPDATE policy for tata_usaha
CREATE POLICY "Tata Usaha can update assignment letters" 
ON public.assignment_letters 
FOR UPDATE 
TO authenticated
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Create permissive DELETE policy for tata_usaha
CREATE POLICY "Tata Usaha can delete assignment letters" 
ON public.assignment_letters 
FOR DELETE 
TO authenticated
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Create permissive SELECT policy for admin
CREATE POLICY "Admins can view assignment letters" 
ON public.assignment_letters 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));