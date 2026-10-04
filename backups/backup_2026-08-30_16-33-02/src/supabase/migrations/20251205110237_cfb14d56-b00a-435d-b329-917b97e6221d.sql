-- Create SPJ documents table for BKU uploads
CREATE TABLE public.spj_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    total_realization NUMERIC DEFAULT 0,
    parsed_data JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'pending',
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create SPJ items table for parsed line items
CREATE TABLE public.spj_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spj_id UUID NOT NULL REFERENCES public.spj_documents(id) ON DELETE CASCADE,
    kode_kegiatan TEXT,
    kode_rekening TEXT,
    activity_name TEXT NOT NULL,
    category TEXT NOT NULL,
    main_category TEXT,
    sub_category TEXT,
    amount NUMERIC DEFAULT 0,
    description TEXT,
    transaction_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.spj_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spj_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for spj_documents
CREATE POLICY "Admins can manage SPJ documents" 
ON public.spj_documents 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage SPJ documents" 
ON public.spj_documents 
FOR ALL 
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- RLS policies for spj_items
CREATE POLICY "Admins can manage SPJ items" 
ON public.spj_items 
FOR ALL 
USING (EXISTS (
    SELECT 1 FROM spj_documents sd 
    WHERE sd.id = spj_items.spj_id 
    AND has_role(auth.uid(), 'admin'::app_role)
));

CREATE POLICY "Bendahara can manage SPJ items" 
ON public.spj_items 
FOR ALL 
USING (EXISTS (
    SELECT 1 FROM spj_documents sd 
    WHERE sd.id = spj_items.spj_id 
    AND has_role(auth.uid(), 'bendahara'::app_role)
))
WITH CHECK (EXISTS (
    SELECT 1 FROM spj_documents sd 
    WHERE sd.id = spj_items.spj_id 
    AND has_role(auth.uid(), 'bendahara'::app_role)
));

-- Create storage bucket for SPJ documents
INSERT INTO storage.buckets (id, name, public) VALUES ('spj-documents', 'spj-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for SPJ documents bucket
CREATE POLICY "Bendahara can upload SPJ files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'spj-documents' AND has_role(auth.uid(), 'bendahara'::app_role));

CREATE POLICY "Anyone can view SPJ files"
ON storage.objects FOR SELECT
USING (bucket_id = 'spj-documents');

CREATE POLICY "Bendahara can delete SPJ files"
ON storage.objects FOR DELETE
USING (bucket_id = 'spj-documents' AND has_role(auth.uid(), 'bendahara'::app_role));

CREATE POLICY "Admin can upload SPJ files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'spj-documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete SPJ files"
ON storage.objects FOR DELETE
USING (bucket_id = 'spj-documents' AND has_role(auth.uid(), 'admin'::app_role));