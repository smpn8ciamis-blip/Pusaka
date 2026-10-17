-- Ketukan PIN milik staf tidak lagi ditandai 'unmapped' di log fingerprint.
-- fp_process_punch mengisi result='unmapped' lewat UPDATE; trigger ini mengoreksinya
-- menjadi person_type='staff' bila PIN cocok dengan data staf (tanpa menulis ulang fungsi).
CREATE OR REPLACE FUNCTION public.fp_mark_staff_punch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_staff uuid;
BEGIN
  IF NEW.result = 'unmapped' AND NEW.person_type IS NULL THEN
    SELECT id INTO v_staff FROM public.staff WHERE fingerprint_pin = NEW.pin LIMIT 1;
    IF v_staff IS NOT NULL THEN
      NEW.person_type := 'staff';
      NEW.person_id := v_staff;
      NEW.result := 'staff';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fp_mark_staff_punch ON public.fingerprint_logs;
CREATE TRIGGER trg_fp_mark_staff_punch
  BEFORE UPDATE OF result ON public.fingerprint_logs
  FOR EACH ROW EXECUTE FUNCTION public.fp_mark_staff_punch();

-- Rapikan log lama
UPDATE public.fingerprint_logs l
   SET person_type = 'staff', person_id = s.id, result = 'staff'
  FROM public.staff s
 WHERE l.result = 'unmapped' AND l.person_type IS NULL AND s.fingerprint_pin = l.pin;
