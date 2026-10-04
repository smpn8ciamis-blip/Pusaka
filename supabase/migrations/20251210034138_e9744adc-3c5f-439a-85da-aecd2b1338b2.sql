-- Create table for MFA backup codes
CREATE TABLE public.mfa_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

-- Users can only view their own backup codes
CREATE POLICY "Users can view their own backup codes"
ON public.mfa_backup_codes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own backup codes
CREATE POLICY "Users can insert their own backup codes"
ON public.mfa_backup_codes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own backup codes (mark as used)
CREATE POLICY "Users can update their own backup codes"
ON public.mfa_backup_codes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can delete their own backup codes
CREATE POLICY "Users can delete their own backup codes"
ON public.mfa_backup_codes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_mfa_backup_codes_user_id ON public.mfa_backup_codes(user_id);
CREATE INDEX idx_mfa_backup_codes_code_hash ON public.mfa_backup_codes(code_hash);