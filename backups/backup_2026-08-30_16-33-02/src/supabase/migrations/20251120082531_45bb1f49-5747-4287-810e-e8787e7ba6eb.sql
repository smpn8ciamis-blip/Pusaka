-- Add parent_signature field to activity_permissions table
ALTER TABLE public.activity_permissions 
  ADD COLUMN parent_signature TEXT;