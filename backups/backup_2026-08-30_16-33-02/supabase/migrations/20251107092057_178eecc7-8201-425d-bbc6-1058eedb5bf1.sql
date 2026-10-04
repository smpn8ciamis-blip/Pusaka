-- Create table for verified reports with serial numbers
CREATE TABLE public.verified_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_number text NOT NULL UNIQUE,
  report_type text NOT NULL,
  report_data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '1 year')
);

-- Create index for faster serial number lookups
CREATE INDEX idx_verified_reports_serial ON public.verified_reports(serial_number);
CREATE INDEX idx_verified_reports_created_at ON public.verified_reports(created_at);

-- Enable RLS
ALTER TABLE public.verified_reports ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read reports (for verification)
CREATE POLICY "Anyone can view reports for verification"
ON public.verified_reports
FOR SELECT
USING (expires_at > now());

-- Only authenticated users can create reports
CREATE POLICY "Authenticated users can create reports"
ON public.verified_reports
FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Function to generate unique serial number
CREATE OR REPLACE FUNCTION generate_report_serial()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  serial text;
  exists boolean;
BEGIN
  LOOP
    -- Format: YYYY-MM-XXXXX (year-month-random 5 digits)
    serial := TO_CHAR(NOW(), 'YYYY-MM-') || LPAD(FLOOR(RANDOM() * 100000)::text, 5, '0');
    
    -- Check if serial already exists
    SELECT EXISTS(SELECT 1 FROM public.verified_reports WHERE serial_number = serial) INTO exists;
    
    EXIT WHEN NOT exists;
  END LOOP;
  
  RETURN serial;
END;
$$;