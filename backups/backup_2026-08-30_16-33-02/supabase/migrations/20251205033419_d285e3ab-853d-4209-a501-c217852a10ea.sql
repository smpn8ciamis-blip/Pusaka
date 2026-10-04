-- Create RKAS table for storing monthly budget data
CREATE TABLE public.rkas_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  total_budget NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  parsed_data JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(month, year)
);

-- Create RKAS items table for detailed budget items
CREATE TABLE public.rkas_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rkas_id UUID NOT NULL REFERENCES public.rkas_documents(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  description TEXT,
  volume NUMERIC DEFAULT 1,
  unit TEXT,
  unit_price NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_rkas_documents_month_year ON public.rkas_documents(month, year);
CREATE INDEX idx_rkas_items_rkas_id ON public.rkas_items(rkas_id);

-- Enable RLS
ALTER TABLE public.rkas_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rkas_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for rkas_documents
CREATE POLICY "Admins can manage RKAS documents"
ON public.rkas_documents FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tata Usaha can manage RKAS documents"
ON public.rkas_documents FOR ALL
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

-- RLS policies for rkas_items
CREATE POLICY "Admins can manage RKAS items"
ON public.rkas_items FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.rkas_documents rd
  WHERE rd.id = rkas_items.rkas_id
  AND has_role(auth.uid(), 'admin'::app_role)
));

CREATE POLICY "Tata Usaha can manage RKAS items"
ON public.rkas_items FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.rkas_documents rd
  WHERE rd.id = rkas_items.rkas_id
  AND has_role(auth.uid(), 'tata_usaha'::app_role)
));

-- Create storage bucket for RKAS files
INSERT INTO storage.buckets (id, name, public) VALUES ('rkas-documents', 'rkas-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Admins can upload RKAS files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'rkas-documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tata Usaha can upload RKAS files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'rkas-documents' AND has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Anyone can view RKAS files"
ON storage.objects FOR SELECT
USING (bucket_id = 'rkas-documents');

CREATE POLICY "Admins can delete RKAS files"
ON storage.objects FOR DELETE
USING (bucket_id = 'rkas-documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tata Usaha can delete RKAS files"
ON storage.objects FOR DELETE
USING (bucket_id = 'rkas-documents' AND has_role(auth.uid(), 'tata_usaha'::app_role));