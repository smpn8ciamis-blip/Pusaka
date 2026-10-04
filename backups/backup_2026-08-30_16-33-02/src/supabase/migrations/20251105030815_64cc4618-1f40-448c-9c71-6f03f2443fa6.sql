-- Create table for school settings including headmaster data
CREATE TABLE IF NOT EXISTS public.school_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  headmaster_name TEXT NOT NULL,
  headmaster_nip TEXT,
  school_name TEXT NOT NULL DEFAULT 'Nama Sekolah',
  school_address TEXT,
  school_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view school settings
CREATE POLICY "Everyone can view school settings"
ON public.school_settings
FOR SELECT
USING (true);

-- Only admins can manage school settings
CREATE POLICY "Admins can manage school settings"
ON public.school_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_school_settings_updated_at
BEFORE UPDATE ON public.school_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default record
INSERT INTO public.school_settings (headmaster_name, school_name)
VALUES ('Nama Kepala Sekolah', 'Nama Sekolah')
ON CONFLICT DO NOTHING;