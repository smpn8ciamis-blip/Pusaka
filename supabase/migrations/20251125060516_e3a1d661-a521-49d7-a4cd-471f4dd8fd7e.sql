-- Fix search_path for complaint tracking number functions
CREATE OR REPLACE FUNCTION generate_complaint_tracking_number()
RETURNS TEXT 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION set_complaint_tracking_number()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tracking_number IS NULL THEN
    NEW.tracking_number := generate_complaint_tracking_number();
  END IF;
  RETURN NEW;
END;
$$;