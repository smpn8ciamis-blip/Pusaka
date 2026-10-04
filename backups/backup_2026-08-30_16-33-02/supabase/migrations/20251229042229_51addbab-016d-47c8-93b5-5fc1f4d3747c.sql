-- Create table for SPD PDF settings
CREATE TABLE public.spd_pdf_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.spd_pdf_settings ENABLE ROW LEVEL SECURITY;

-- Policies - everyone authenticated can view, admin/bendahara/tata_usaha can manage
CREATE POLICY "Authenticated users can view SPD PDF settings"
ON public.spd_pdf_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage SPD PDF settings"
ON public.spd_pdf_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage SPD PDF settings"
ON public.spd_pdf_settings
FOR ALL
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

CREATE POLICY "Tata Usaha can manage SPD PDF settings"
ON public.spd_pdf_settings
FOR ALL
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_spd_pdf_settings_updated_at
BEFORE UPDATE ON public.spd_pdf_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();