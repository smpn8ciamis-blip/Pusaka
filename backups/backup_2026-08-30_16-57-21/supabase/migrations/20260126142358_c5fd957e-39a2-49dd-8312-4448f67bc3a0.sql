-- Create tax_types table for managing different tax types
CREATE TABLE public.tax_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tax_records table for recording tax collection and deposits
CREATE TABLE public.tax_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tax_type_id UUID NOT NULL REFERENCES public.tax_types(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('pemungutan', 'penyetoran')),
  gross_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  description TEXT,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_number TEXT,
  npwp TEXT,
  taxpayer_name TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tax_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_records ENABLE ROW LEVEL SECURITY;

-- RLS policies for tax_types
CREATE POLICY "Users with bendahara or admin role can view tax types"
ON public.tax_types FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'bendahara')
);

CREATE POLICY "Users with bendahara or admin role can insert tax types"
ON public.tax_types FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'bendahara')
);

CREATE POLICY "Users with bendahara or admin role can update tax types"
ON public.tax_types FOR UPDATE
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'bendahara')
);

CREATE POLICY "Users with bendahara or admin role can delete tax types"
ON public.tax_types FOR DELETE
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'bendahara')
);

-- RLS policies for tax_records
CREATE POLICY "Users with bendahara or admin role can view tax records"
ON public.tax_records FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'bendahara')
);

CREATE POLICY "Users with bendahara or admin role can insert tax records"
ON public.tax_records FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'bendahara')
);

CREATE POLICY "Users with bendahara or admin role can update tax records"
ON public.tax_records FOR UPDATE
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'bendahara')
);

CREATE POLICY "Users with bendahara or admin role can delete tax records"
ON public.tax_records FOR DELETE
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'bendahara')
);

-- Create triggers for updated_at
CREATE TRIGGER update_tax_types_updated_at
BEFORE UPDATE ON public.tax_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tax_records_updated_at
BEFORE UPDATE ON public.tax_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default tax types (common Indonesian taxes)
INSERT INTO public.tax_types (name, code, rate, description) VALUES
('PPh Pasal 21', 'PPH21', 5.00, 'Pajak Penghasilan Pasal 21 - Pajak atas penghasilan berupa gaji, upah, honorarium'),
('PPh Pasal 22', 'PPH22', 1.50, 'Pajak Penghasilan Pasal 22 - Pajak atas pembelian barang'),
('PPh Pasal 23', 'PPH23', 2.00, 'Pajak Penghasilan Pasal 23 - Pajak atas jasa, royalti, bunga'),
('PPN', 'PPN', 11.00, 'Pajak Pertambahan Nilai');