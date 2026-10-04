-- Create storage bucket for permission letters
INSERT INTO storage.buckets (id, name, public)
VALUES ('permission-letters', 'permission-letters', true);

-- Create permission_letters table
CREATE TABLE public.permission_letters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  letter_pdf_url TEXT NOT NULL,
  letter_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  parent_name TEXT,
  parent_response TEXT,
  response_date TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.permission_letters ENABLE ROW LEVEL SECURITY;

-- Admins can manage all letters
CREATE POLICY "Admins can manage permission letters"
ON public.permission_letters
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can view letters (for public access by parents)
CREATE POLICY "Anyone can view permission letters"
ON public.permission_letters
FOR SELECT
USING (true);

-- Anyone can update status/response for letters
CREATE POLICY "Anyone can respond to permission letters"
ON public.permission_letters
FOR UPDATE
USING (true);

-- Storage policies for permission letters
CREATE POLICY "Anyone can view permission letter files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'permission-letters');

CREATE POLICY "Admins can upload permission letters"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'permission-letters' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete permission letters"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'permission-letters' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Trigger for updated_at
CREATE TRIGGER update_permission_letters_updated_at
BEFORE UPDATE ON public.permission_letters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();