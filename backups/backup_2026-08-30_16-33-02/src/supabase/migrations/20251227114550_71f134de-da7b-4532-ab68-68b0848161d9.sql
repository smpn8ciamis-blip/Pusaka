-- Create table for GTT/PTT honorarium payments
CREATE TABLE public.gtt_ptt_honorariums (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    honorarium_amount NUMERIC NOT NULL DEFAULT 0,
    tax_percentage NUMERIC NOT NULL DEFAULT 0,
    tax_amount NUMERIC NOT NULL DEFAULT 0,
    net_amount NUMERIC NOT NULL DEFAULT 0,
    payment_month INTEGER NOT NULL,
    payment_year INTEGER NOT NULL,
    receipt_number TEXT NOT NULL,
    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.gtt_ptt_honorariums ENABLE ROW LEVEL SECURITY;

-- Create policies for admin
CREATE POLICY "Admins can manage GTT/PTT honorariums"
ON public.gtt_ptt_honorariums
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create policies for bendahara
CREATE POLICY "Bendahara can manage GTT/PTT honorariums"
ON public.gtt_ptt_honorariums
FOR ALL
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- Create trigger for updating updated_at
CREATE TRIGGER update_gtt_ptt_honorariums_updated_at
BEFORE UPDATE ON public.gtt_ptt_honorariums
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();