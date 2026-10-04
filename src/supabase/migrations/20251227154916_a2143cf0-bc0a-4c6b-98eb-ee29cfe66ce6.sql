-- Create table for SK settings per year
CREATE TABLE public.cash_audit_sk_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  sk_number TEXT,
  sk_date DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cash_audit_sk_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage SK settings" 
ON public.cash_audit_sk_settings 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage SK settings" 
ON public.cash_audit_sk_settings 
FOR ALL 
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));