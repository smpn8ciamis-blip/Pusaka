-- Drop old permission_letters table and create new structure
DROP TABLE IF EXISTS public.permission_letters;

-- Create activities table for school activities
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  description TEXT,
  activity_date DATE,
  location TEXT,
  attachment_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create activity_permissions table to track parent responses
CREATE TABLE public.activity_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  parent_name TEXT,
  parent_response TEXT,
  response_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(activity_id, student_id)
);

-- Enable RLS
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for activities
CREATE POLICY "Admins can manage activities"
  ON public.activities FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active activities"
  ON public.activities FOR SELECT
  USING (is_active = true);

-- RLS Policies for activity_permissions
CREATE POLICY "Admins can view all permissions"
  ON public.activity_permissions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can create permissions"
  ON public.activity_permissions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update permissions"
  ON public.activity_permissions FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can view permissions"
  ON public.activity_permissions FOR SELECT
  USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_activity_permissions_updated_at
  BEFORE UPDATE ON public.activity_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();