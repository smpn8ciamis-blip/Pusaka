-- Add columns for manual executor data in official_travel_followers
ALTER TABLE public.official_travel_followers 
ADD COLUMN IF NOT EXISTS manual_executor_name TEXT,
ADD COLUMN IF NOT EXISTS manual_executor_nip TEXT,
ADD COLUMN IF NOT EXISTS manual_executor_pangkat TEXT,
ADD COLUMN IF NOT EXISTS manual_executor_jabatan TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.official_travel_followers.manual_executor_name IS 'Name for manually added executor (when follower_type is manual_executor)';
COMMENT ON COLUMN public.official_travel_followers.manual_executor_nip IS 'NIP for manually added executor';
COMMENT ON COLUMN public.official_travel_followers.manual_executor_pangkat IS 'Pangkat/Golongan for manually added executor';
COMMENT ON COLUMN public.official_travel_followers.manual_executor_jabatan IS 'Jabatan for manually added executor';