-- Add signature and stamp fields to school_settings
ALTER TABLE public.school_settings 
ADD COLUMN IF NOT EXISTS headmaster_signature_url text,
ADD COLUMN IF NOT EXISTS school_stamp_url text;