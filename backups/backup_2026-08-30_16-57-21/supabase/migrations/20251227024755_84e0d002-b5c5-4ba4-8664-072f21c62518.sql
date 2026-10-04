
-- Create worker_rates table for position-based rates
CREATE TABLE public.worker_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_type text NOT NULL UNIQUE,
  daily_rate numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.worker_rates ENABLE ROW LEVEL SECURITY;

-- RLS policies for worker_rates
CREATE POLICY "Admins can manage worker rates"
ON public.worker_rates FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage worker rates"
ON public.worker_rates FOR ALL
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- Create worker_payment_batches table for collective receipts
CREATE TABLE public.worker_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text NOT NULL UNIQUE,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  job_title text NOT NULL,
  description text,
  total_gross numeric NOT NULL DEFAULT 0,
  total_tax numeric NOT NULL DEFAULT 0,
  total_net numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.worker_payment_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies for worker_payment_batches
CREATE POLICY "Admins can manage worker payment batches"
ON public.worker_payment_batches FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage worker payment batches"
ON public.worker_payment_batches FOR ALL
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- Create worker_payments table for individual worker payments
CREATE TABLE public.worker_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.worker_payment_batches(id) ON DELETE CASCADE NOT NULL,
  worker_name text NOT NULL,
  position_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  work_days integer NOT NULL DEFAULT 0,
  daily_rate numeric NOT NULL DEFAULT 0,
  gross_amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.worker_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies for worker_payments
CREATE POLICY "Admins can manage worker payments"
ON public.worker_payments FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.worker_payment_batches b
  WHERE b.id = worker_payments.batch_id
  AND has_role(auth.uid(), 'admin'::app_role)
));

CREATE POLICY "Bendahara can manage worker payments"
ON public.worker_payments FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.worker_payment_batches b
  WHERE b.id = worker_payments.batch_id
  AND has_role(auth.uid(), 'bendahara'::app_role)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.worker_payment_batches b
  WHERE b.id = worker_payments.batch_id
  AND has_role(auth.uid(), 'bendahara'::app_role)
));

-- Add indexes
CREATE INDEX idx_worker_payments_batch_id ON public.worker_payments(batch_id);
CREATE INDEX idx_worker_payment_batches_receipt_date ON public.worker_payment_batches(receipt_date);

-- Insert default worker rates
INSERT INTO public.worker_rates (position_type, daily_rate) VALUES
('Kepala Tukang', 150000),
('Tukang', 120000),
('Kenek', 80000);

-- Add trigger for updated_at
CREATE TRIGGER update_worker_rates_updated_at
BEFORE UPDATE ON public.worker_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_worker_payment_batches_updated_at
BEFORE UPDATE ON public.worker_payment_batches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
