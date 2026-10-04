
-- Create table for incoming letters (surat masuk)
CREATE TABLE public.surat_masuk (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nomor_surat TEXT NOT NULL,
  tanggal_surat DATE NOT NULL,
  tanggal_diterima DATE NOT NULL DEFAULT CURRENT_DATE,
  pengirim TEXT NOT NULL,
  perihal TEXT NOT NULL,
  kategori TEXT NOT NULL DEFAULT 'umum',
  file_url TEXT,
  catatan TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for outgoing letters (surat keluar)
CREATE TABLE public.surat_keluar (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nomor_surat TEXT NOT NULL,
  tanggal_surat DATE NOT NULL DEFAULT CURRENT_DATE,
  tujuan TEXT NOT NULL,
  perihal TEXT NOT NULL,
  kategori TEXT NOT NULL DEFAULT 'umum',
  file_url TEXT,
  catatan TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.surat_masuk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surat_keluar ENABLE ROW LEVEL SECURITY;

-- RLS Policies for surat_masuk
CREATE POLICY "Admins can manage surat masuk"
ON public.surat_masuk FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tata Usaha can manage surat masuk"
ON public.surat_masuk FOR ALL
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Bendahara can view surat masuk"
ON public.surat_masuk FOR SELECT
USING (has_role(auth.uid(), 'bendahara'::app_role));

-- RLS Policies for surat_keluar
CREATE POLICY "Admins can manage surat keluar"
ON public.surat_keluar FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tata Usaha can manage surat keluar"
ON public.surat_keluar FOR ALL
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Bendahara can view surat keluar"
ON public.surat_keluar FOR SELECT
USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Create updated_at triggers
CREATE TRIGGER update_surat_masuk_updated_at
BEFORE UPDATE ON public.surat_masuk
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_surat_keluar_updated_at
BEFORE UPDATE ON public.surat_keluar
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
