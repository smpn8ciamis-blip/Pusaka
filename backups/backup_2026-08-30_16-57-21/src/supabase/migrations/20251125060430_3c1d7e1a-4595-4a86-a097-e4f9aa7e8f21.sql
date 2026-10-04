-- Add tracking number to complaints table
ALTER TABLE public.complaints 
ADD COLUMN tracking_number TEXT UNIQUE;

-- Create function to generate tracking number
CREATE OR REPLACE FUNCTION generate_complaint_tracking_number()
RETURNS TEXT AS $$
DECLARE
  tracking_num TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    -- Format: CP-YYYYMMDD-XXXXX (Complaint-Date-5 digit random)
    tracking_num := 'CP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
    
    -- Check if tracking number already exists
    SELECT EXISTS(SELECT 1 FROM public.complaints WHERE tracking_number = tracking_num) INTO exists_check;
    
    EXIT WHEN NOT exists_check;
  END LOOP;
  
  RETURN tracking_num;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate tracking number on insert
CREATE OR REPLACE FUNCTION set_complaint_tracking_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tracking_number IS NULL THEN
    NEW.tracking_number := generate_complaint_tracking_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tracking_number_before_insert
BEFORE INSERT ON public.complaints
FOR EACH ROW
EXECUTE FUNCTION set_complaint_tracking_number();

-- Create index for tracking number lookups
CREATE INDEX idx_complaints_tracking_number ON public.complaints(tracking_number);

-- Update RLS policy to allow public to view their own complaint by tracking number
CREATE POLICY "Anyone can view complaint with tracking number"
ON public.complaints
FOR SELECT
USING (tracking_number IS NOT NULL);