-- Create travel payment rates table
CREATE TABLE public.travel_payment_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  position_type TEXT NOT NULL UNIQUE,
  daily_rate NUMERIC NOT NULL DEFAULT 0,
  transport_rate NUMERIC NOT NULL DEFAULT 0,
  accommodation_rate NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.travel_payment_rates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage travel payment rates"
ON public.travel_payment_rates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tata Usaha can view travel payment rates"
ON public.travel_payment_rates
FOR SELECT
USING (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Tata Usaha can manage travel payment rates"
ON public.travel_payment_rates
FOR ALL
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

-- Insert default rates
INSERT INTO public.travel_payment_rates (position_type, daily_rate, transport_rate, accommodation_rate) VALUES
('Kepala Sekolah', 500000, 300000, 400000),
('Guru', 350000, 200000, 300000),
('Siswa', 200000, 150000, 200000);

-- Trigger for updated_at
CREATE TRIGGER update_travel_payment_rates_updated_at
BEFORE UPDATE ON public.travel_payment_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();