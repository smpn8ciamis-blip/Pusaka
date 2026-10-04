-- Add remaining RLS policies for tata_usaha role (only those not yet created)

-- Tata Usaha can update bendahara settings in school_settings
CREATE POLICY "Tata Usaha can update school settings" 
ON public.school_settings 
FOR UPDATE 
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Teachers - Tata Usaha can view (for selecting teachers in documents)
CREATE POLICY "Tata Usaha can view teachers" 
ON public.teachers 
FOR SELECT 
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Profiles - Tata Usaha can view (for teacher names)
CREATE POLICY "Tata Usaha can view profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Students - Tata Usaha can view (for student followers in SPD)
CREATE POLICY "Tata Usaha can view students" 
ON public.students 
FOR SELECT 
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Classes - Tata Usaha can view (for student class info)
CREATE POLICY "Tata Usaha can view classes" 
ON public.classes 
FOR SELECT 
USING (has_role(auth.uid(), 'tata_usaha'::app_role));