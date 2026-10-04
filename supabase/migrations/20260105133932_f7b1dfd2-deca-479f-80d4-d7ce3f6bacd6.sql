-- Create table for sync configuration
CREATE TABLE IF NOT EXISTS public.sync_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Default',
  local_supabase_url TEXT,
  sync_direction TEXT NOT NULL DEFAULT 'local_to_cloud',
  last_sync_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  sync_interval_minutes INTEGER DEFAULT 30,
  tables_to_sync TEXT[] DEFAULT ARRAY['students', 'teachers', 'classes', 'schedules', 'attendance', 'grades', 'student_violations', 'student_achievements'],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.sync_configurations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view sync configurations" 
ON public.sync_configurations 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage sync configurations" 
ON public.sync_configurations 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_sync_configurations_updated_at
BEFORE UPDATE ON public.sync_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add sync_key column to track sync status per record
-- We'll use the existing sync_logs table for tracking