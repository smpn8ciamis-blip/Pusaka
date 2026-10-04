-- Step 2: Update existing user_roles from 'tata_usaha' to 'bendahara'
UPDATE public.user_roles SET role = 'bendahara' WHERE role = 'tata_usaha';

-- Update RLS policies for rkas_items table
DROP POLICY IF EXISTS "Tata Usaha can manage RKAS items" ON public.rkas_items;
CREATE POLICY "Bendahara can manage RKAS items" ON public.rkas_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM rkas_documents rd
    WHERE rd.id = rkas_items.rkas_id AND has_role(auth.uid(), 'bendahara'::app_role)
  )
);

-- Update RLS policies for rkas_documents table
DROP POLICY IF EXISTS "Tata Usaha can manage RKAS documents" ON public.rkas_documents;
CREATE POLICY "Bendahara can manage RKAS documents" ON public.rkas_documents FOR ALL USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for assignment_letter_teachers table
DROP POLICY IF EXISTS "Tata Usaha can manage assignment letter teachers" ON public.assignment_letter_teachers;
CREATE POLICY "Bendahara can manage assignment letter teachers" ON public.assignment_letter_teachers FOR ALL USING (has_role(auth.uid(), 'bendahara'::app_role)) WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for assignment_letters table
DROP POLICY IF EXISTS "Tata Usaha can insert assignment letters" ON public.assignment_letters;
CREATE POLICY "Bendahara can insert assignment letters" ON public.assignment_letters FOR INSERT WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

DROP POLICY IF EXISTS "Tata Usaha can update assignment letters" ON public.assignment_letters;
CREATE POLICY "Bendahara can update assignment letters" ON public.assignment_letters FOR UPDATE USING (has_role(auth.uid(), 'bendahara'::app_role));

DROP POLICY IF EXISTS "Tata Usaha can delete assignment letters" ON public.assignment_letters;
CREATE POLICY "Bendahara can delete assignment letters" ON public.assignment_letters FOR DELETE USING (has_role(auth.uid(), 'bendahara'::app_role));

DROP POLICY IF EXISTS "Tata Usaha can view assignment letters" ON public.assignment_letters;
CREATE POLICY "Bendahara can view assignment letters" ON public.assignment_letters FOR SELECT USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for official_travel_teachers table
DROP POLICY IF EXISTS "Tata Usaha can manage official travel teachers" ON public.official_travel_teachers;
CREATE POLICY "Bendahara can manage official travel teachers" ON public.official_travel_teachers FOR ALL USING (has_role(auth.uid(), 'bendahara'::app_role)) WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for official_travel_letters table
DROP POLICY IF EXISTS "Tata Usaha can manage official travel letters" ON public.official_travel_letters;
CREATE POLICY "Bendahara can manage official travel letters" ON public.official_travel_letters FOR ALL USING (has_role(auth.uid(), 'bendahara'::app_role)) WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for payment_receipts table
DROP POLICY IF EXISTS "Tata Usaha can manage payment receipts" ON public.payment_receipts;
CREATE POLICY "Bendahara can manage payment receipts" ON public.payment_receipts FOR ALL USING (has_role(auth.uid(), 'bendahara'::app_role)) WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for travel_payment_rates table
DROP POLICY IF EXISTS "Tata Usaha can manage travel payment rates" ON public.travel_payment_rates;
CREATE POLICY "Bendahara can manage travel payment rates" ON public.travel_payment_rates FOR ALL USING (has_role(auth.uid(), 'bendahara'::app_role)) WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

DROP POLICY IF EXISTS "Tata Usaha can view travel payment rates" ON public.travel_payment_rates;
CREATE POLICY "Bendahara can view travel payment rates" ON public.travel_payment_rates FOR SELECT USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for teachers table
DROP POLICY IF EXISTS "Tata Usaha can view teachers" ON public.teachers;
CREATE POLICY "Bendahara can view teachers" ON public.teachers FOR SELECT USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for classes table
DROP POLICY IF EXISTS "Tata Usaha can view classes" ON public.classes;
CREATE POLICY "Bendahara can view classes" ON public.classes FOR SELECT USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for profiles table
DROP POLICY IF EXISTS "Tata Usaha can view profiles" ON public.profiles;
CREATE POLICY "Bendahara can view profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for students table
DROP POLICY IF EXISTS "Tata Usaha can view students" ON public.students;
CREATE POLICY "Bendahara can view students" ON public.students FOR SELECT USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Update RLS policies for school_settings table
DROP POLICY IF EXISTS "Tata Usaha can update school_settings bendahara fields" ON public.school_settings;
CREATE POLICY "Bendahara can update school_settings bendahara fields" ON public.school_settings FOR UPDATE USING (has_role(auth.uid(), 'bendahara'::app_role));

DROP POLICY IF EXISTS "Tata Usaha can view school_settings" ON public.school_settings;
CREATE POLICY "Bendahara can view school_settings" ON public.school_settings FOR SELECT USING (has_role(auth.uid(), 'bendahara'::app_role));