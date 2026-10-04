-- Create repository table for storing file links
CREATE TABLE public.repository (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  google_drive_link TEXT NOT NULL,
  file_type TEXT,
  category TEXT NOT NULL DEFAULT 'lainnya',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.repository ENABLE ROW LEVEL SECURITY;

-- Admins can manage all repository items
CREATE POLICY "Admins can manage repository"
ON public.repository
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Teachers and admins can view repository
CREATE POLICY "Teachers and admins can view repository"
ON public.repository
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'teacher'::app_role)
);

-- Trigger for updated_at
CREATE TRIGGER update_repository_updated_at
BEFORE UPDATE ON public.repository
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();