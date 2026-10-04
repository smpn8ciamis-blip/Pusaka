-- Create extracurricular types table
CREATE TABLE public.extracurricular_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create extracurricular instructors table
CREATE TABLE public.extracurricular_instructors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  extracurricular_type_id UUID NOT NULL REFERENCES public.extracurricular_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nip TEXT,
  nuptk TEXT,
  pangkat_golongan TEXT,
  jabatan TEXT,
  honor_amount NUMERIC NOT NULL DEFAULT 0,
  tax_percentage NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create extracurricular honorariums table
CREATE TABLE public.extracurricular_honorariums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID NOT NULL REFERENCES public.extracurricular_instructors(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_month INTEGER NOT NULL,
  payment_year INTEGER NOT NULL,
  honorarium_amount NUMERIC NOT NULL DEFAULT 0,
  tax_percentage NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.extracurricular_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracurricular_instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracurricular_honorariums ENABLE ROW LEVEL SECURITY;

-- RLS policies for extracurricular_types
CREATE POLICY "Admins can manage extracurricular types" ON public.extracurricular_types
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage extracurricular types" ON public.extracurricular_types
  FOR ALL USING (has_role(auth.uid(), 'bendahara'::app_role))
  WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

CREATE POLICY "Anyone can view active extracurricular types" ON public.extracurricular_types
  FOR SELECT USING (is_active = true);

-- RLS policies for extracurricular_instructors
CREATE POLICY "Admins can manage extracurricular instructors" ON public.extracurricular_instructors
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage extracurricular instructors" ON public.extracurricular_instructors
  FOR ALL USING (has_role(auth.uid(), 'bendahara'::app_role))
  WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

CREATE POLICY "Anyone can view active extracurricular instructors" ON public.extracurricular_instructors
  FOR SELECT USING (is_active = true);

-- RLS policies for extracurricular_honorariums
CREATE POLICY "Admins can manage extracurricular honorariums" ON public.extracurricular_honorariums
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage extracurricular honorariums" ON public.extracurricular_honorariums
  FOR ALL USING (has_role(auth.uid(), 'bendahara'::app_role))
  WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));