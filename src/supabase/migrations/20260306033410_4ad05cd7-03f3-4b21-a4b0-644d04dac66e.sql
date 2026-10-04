
-- Create narasumber_types table (mirrors extracurricular_types)
CREATE TABLE public.narasumber_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  school_id UUID REFERENCES public.schools(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create narasumber_instructors table (mirrors extracurricular_instructors)
CREATE TABLE public.narasumber_instructors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  narasumber_type_id UUID NOT NULL REFERENCES public.narasumber_types(id),
  name TEXT NOT NULL,
  nip TEXT,
  nuptk TEXT,
  pangkat_golongan TEXT,
  jabatan TEXT,
  honor_amount NUMERIC NOT NULL DEFAULT 0,
  tax_percentage NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  school_id UUID REFERENCES public.schools(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create narasumber_honorariums table (mirrors extracurricular_honorariums)
CREATE TABLE public.narasumber_honorariums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instructor_id UUID NOT NULL REFERENCES public.narasumber_instructors(id),
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
  school_id UUID REFERENCES public.schools(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.narasumber_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narasumber_instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narasumber_honorariums ENABLE ROW LEVEL SECURITY;

-- RLS policies for narasumber_types
CREATE POLICY "Users can view narasumber types from their school" ON public.narasumber_types FOR SELECT TO authenticated USING (school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "Users can insert narasumber types" ON public.narasumber_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update narasumber types" ON public.narasumber_types FOR UPDATE TO authenticated USING (school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "Users can delete narasumber types" ON public.narasumber_types FOR DELETE TO authenticated USING (school_id = public.get_user_school_id() OR public.is_super_admin());

-- RLS policies for narasumber_instructors
CREATE POLICY "Users can view narasumber instructors from their school" ON public.narasumber_instructors FOR SELECT TO authenticated USING (school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "Users can insert narasumber instructors" ON public.narasumber_instructors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update narasumber instructors" ON public.narasumber_instructors FOR UPDATE TO authenticated USING (school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "Users can delete narasumber instructors" ON public.narasumber_instructors FOR DELETE TO authenticated USING (school_id = public.get_user_school_id() OR public.is_super_admin());

-- RLS policies for narasumber_honorariums
CREATE POLICY "Users can view narasumber honorariums from their school" ON public.narasumber_honorariums FOR SELECT TO authenticated USING (school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "Users can insert narasumber honorariums" ON public.narasumber_honorariums FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update narasumber honorariums" ON public.narasumber_honorariums FOR UPDATE TO authenticated USING (school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "Users can delete narasumber honorariums" ON public.narasumber_honorariums FOR DELETE TO authenticated USING (school_id = public.get_user_school_id() OR public.is_super_admin());

-- Auto-set school_id triggers
CREATE TRIGGER set_narasumber_types_school_id BEFORE INSERT ON public.narasumber_types FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER set_narasumber_instructors_school_id BEFORE INSERT ON public.narasumber_instructors FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER set_narasumber_honorariums_school_id BEFORE INSERT ON public.narasumber_honorariums FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
