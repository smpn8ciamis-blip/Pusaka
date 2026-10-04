-- Create academic_years table to store all academic years
CREATE TABLE public.academic_years (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

-- Admins can manage academic years
CREATE POLICY "Admins can manage academic years"
ON public.academic_years
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Everyone can view academic years
CREATE POLICY "Everyone can view academic years"
ON public.academic_years
FOR SELECT
USING (true);

-- Create trigger to update updated_at
CREATE TRIGGER update_academic_years_updated_at
BEFORE UPDATE ON public.academic_years
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure only one active academic year at a time
CREATE OR REPLACE FUNCTION public.ensure_single_active_academic_year()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    -- Deactivate all other academic years
    UPDATE public.academic_years
    SET is_active = false
    WHERE id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER ensure_single_active_academic_year_trigger
BEFORE INSERT OR UPDATE ON public.academic_years
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION public.ensure_single_active_academic_year();