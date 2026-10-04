-- Create changelog table to store application changes
CREATE TABLE public.changelog_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version VARCHAR(20) NOT NULL,
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('feature', 'fix', 'improvement', 'breaking')),
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

-- Everyone can view changelog
CREATE POLICY "Anyone can view changelog" 
ON public.changelog_entries 
FOR SELECT 
USING (true);

-- Only admins can insert changelog entries
CREATE POLICY "Admins can insert changelog" 
ON public.changelog_entries 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Only admins can update changelog entries
CREATE POLICY "Admins can update changelog" 
ON public.changelog_entries 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));

-- Only admins can delete changelog entries
CREATE POLICY "Admins can delete changelog" 
ON public.changelog_entries 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'));

-- Create app_versions table to track version history
CREATE TABLE public.app_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version VARCHAR(20) NOT NULL,
  revision VARCHAR(20) NOT NULL,
  release_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- Everyone can view versions
CREATE POLICY "Anyone can view versions" 
ON public.app_versions 
FOR SELECT 
USING (true);

-- Only admins can manage versions
CREATE POLICY "Admins can insert versions" 
ON public.app_versions 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update versions" 
ON public.app_versions 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));

-- Function to ensure only one current version
CREATE OR REPLACE FUNCTION public.ensure_single_current_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE public.app_versions
    SET is_current = false
    WHERE id != NEW.id AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for single current version
CREATE TRIGGER ensure_single_current_version_trigger
BEFORE INSERT OR UPDATE ON public.app_versions
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_current_version();

-- Insert initial current version
INSERT INTO public.app_versions (version, revision, is_current, release_date)
VALUES ('1.0', '20251209.0600', true, CURRENT_DATE);