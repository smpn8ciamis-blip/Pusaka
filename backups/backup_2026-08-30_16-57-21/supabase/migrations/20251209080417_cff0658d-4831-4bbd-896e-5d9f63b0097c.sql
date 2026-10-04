
-- Create disposisi surat table
CREATE TABLE public.disposisi_surat (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  surat_masuk_id UUID NOT NULL REFERENCES public.surat_masuk(id) ON DELETE CASCADE,
  tujuan_disposisi TEXT NOT NULL,
  instruksi TEXT NOT NULL,
  catatan TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  tanggal_disposisi DATE NOT NULL DEFAULT CURRENT_DATE,
  tanggal_selesai DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.disposisi_surat ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage disposisi"
ON public.disposisi_surat FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tata Usaha can manage disposisi"
ON public.disposisi_surat FOR ALL
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Bendahara can view disposisi"
ON public.disposisi_surat FOR SELECT
USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Create updated_at trigger
CREATE TRIGGER update_disposisi_surat_updated_at
BEFORE UPDATE ON public.disposisi_surat
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
