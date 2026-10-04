-- Add assignment_letter_id column to official_travel_letters for direct linking
ALTER TABLE public.official_travel_letters 
ADD COLUMN IF NOT EXISTS assignment_letter_id UUID REFERENCES public.assignment_letters(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_official_travel_letters_assignment_letter_id 
ON public.official_travel_letters(assignment_letter_id);

-- Create function to auto-copy manual executors from assignment letter
CREATE OR REPLACE FUNCTION public.copy_manual_executors_to_spd()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only proceed if assignment_letter_id is set
  IF NEW.assignment_letter_id IS NOT NULL THEN
    -- Insert manual executors from assignment letter as followers
    INSERT INTO public.official_travel_followers (
      official_travel_id,
      follower_type,
      manual_executor_name,
      manual_executor_nip,
      manual_executor_pangkat,
      manual_executor_jabatan
    )
    SELECT 
      NEW.id,
      'manual_executor',
      ame.full_name,
      ame.nip,
      ame.pangkat_golongan,
      ame.jabatan
    FROM public.assignment_letter_manual_executors ame
    WHERE ame.assignment_letter_id = NEW.assignment_letter_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-copy manual executors on SPD insert
DROP TRIGGER IF EXISTS trigger_copy_manual_executors ON public.official_travel_letters;
CREATE TRIGGER trigger_copy_manual_executors
AFTER INSERT ON public.official_travel_letters
FOR EACH ROW
EXECUTE FUNCTION public.copy_manual_executors_to_spd();

-- Create function to sync manual executors on SPD update (when assignment_letter_id changes)
CREATE OR REPLACE FUNCTION public.sync_manual_executors_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only proceed if assignment_letter_id changed
  IF NEW.assignment_letter_id IS DISTINCT FROM OLD.assignment_letter_id AND NEW.assignment_letter_id IS NOT NULL THEN
    -- Delete existing manual executors for this SPD
    DELETE FROM public.official_travel_followers 
    WHERE official_travel_id = NEW.id AND follower_type = 'manual_executor';
    
    -- Insert new manual executors from the new assignment letter
    INSERT INTO public.official_travel_followers (
      official_travel_id,
      follower_type,
      manual_executor_name,
      manual_executor_nip,
      manual_executor_pangkat,
      manual_executor_jabatan
    )
    SELECT 
      NEW.id,
      'manual_executor',
      ame.full_name,
      ame.nip,
      ame.pangkat_golongan,
      ame.jabatan
    FROM public.assignment_letter_manual_executors ame
    WHERE ame.assignment_letter_id = NEW.assignment_letter_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to sync manual executors on SPD update
DROP TRIGGER IF EXISTS trigger_sync_manual_executors ON public.official_travel_letters;
CREATE TRIGGER trigger_sync_manual_executors
AFTER UPDATE ON public.official_travel_letters
FOR EACH ROW
EXECUTE FUNCTION public.sync_manual_executors_on_update();