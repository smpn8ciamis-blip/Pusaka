-- Create table for payment receipts (kwitansi) linked to SPPD
CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_travel_id uuid NOT NULL REFERENCES public.official_travel_letters(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  recipient_name text NOT NULL,
  recipient_position text,
  amount numeric NOT NULL DEFAULT 0,
  amount_text text NOT NULL,
  description text NOT NULL,
  payment_type text NOT NULL DEFAULT 'transport',
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_receipts
CREATE POLICY "Tata Usaha can manage payment receipts"
ON public.payment_receipts
FOR ALL
USING (has_role(auth.uid(), 'tata_usaha'::app_role))
WITH CHECK (has_role(auth.uid(), 'tata_usaha'::app_role));

CREATE POLICY "Admins can view payment receipts"
ON public.payment_receipts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));