-- Create assignment_letters table (Surat Tugas)
CREATE TABLE IF NOT EXISTS public.assignment_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_number TEXT NOT NULL UNIQUE,
  letter_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assignment_type TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create assignment_letter_teachers junction table (many-to-many)
CREATE TABLE IF NOT EXISTS public.assignment_letter_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_letter_id UUID NOT NULL REFERENCES public.assignment_letters(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(assignment_letter_id, teacher_id)
);

-- Create official_travel_letters table (SPPD)
CREATE TABLE IF NOT EXISTS public.official_travel_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_number TEXT NOT NULL UNIQUE,
  letter_date DATE NOT NULL DEFAULT CURRENT_DATE,
  purpose TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_date DATE NOT NULL,
  return_date DATE NOT NULL,
  transportation TEXT,
  accommodation_budget NUMERIC,
  travel_budget NUMERIC,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create official_travel_teachers junction table
CREATE TABLE IF NOT EXISTS public.official_travel_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  official_travel_id UUID NOT NULL REFERENCES public.official_travel_letters(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(official_travel_id, teacher_id)
);

-- Enable RLS
ALTER TABLE public.assignment_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_letter_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_travel_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_travel_teachers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for assignment_letters
CREATE POLICY "Tata Usaha can manage assignment letters"
ON public.assignment_letters
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Admins can view assignment letters"
ON public.assignment_letters
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for assignment_letter_teachers
CREATE POLICY "Tata Usaha can manage assignment letter teachers"
ON public.assignment_letter_teachers
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Admins can view assignment letter teachers"
ON public.assignment_letter_teachers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for official_travel_letters
CREATE POLICY "Tata Usaha can manage official travel letters"
ON public.official_travel_letters
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Admins can view official travel letters"
ON public.official_travel_letters
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for official_travel_teachers
CREATE POLICY "Tata Usaha can manage official travel teachers"
ON public.official_travel_teachers
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Admins can view official travel teachers"
ON public.official_travel_teachers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger for assignment_letters
CREATE TRIGGER update_assignment_letters_updated_at
BEFORE UPDATE ON public.assignment_letters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger for official_travel_letters
CREATE TRIGGER update_official_travel_letters_updated_at
BEFORE UPDATE ON public.official_travel_letters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_assignment_letters_letter_date ON public.assignment_letters(letter_date DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_letters_created_by ON public.assignment_letters(created_by);
CREATE INDEX IF NOT EXISTS idx_official_travel_letters_letter_date ON public.official_travel_letters(letter_date DESC);
CREATE INDEX IF NOT EXISTS idx_official_travel_letters_created_by ON public.official_travel_letters(created_by);