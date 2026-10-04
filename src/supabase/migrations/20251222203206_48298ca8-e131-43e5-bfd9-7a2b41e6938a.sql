-- Enable RLS on the view (views inherit from base table)
-- Create a policy to allow public read access to school_settings_public view
-- Since school_settings_public is a VIEW, we need to ensure it's accessible

-- First, let's grant SELECT permission on the view to anon role
GRANT SELECT ON public.school_settings_public TO anon;
GRANT SELECT ON public.school_settings_public TO authenticated;