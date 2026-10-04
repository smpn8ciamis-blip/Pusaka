-- Create table for file upload requirements (managed by admin)
CREATE TABLE public.file_upload_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  file_type TEXT, -- e.g. 'pdf', 'image', 'document'
  is_required BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  max_file_size_mb INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

-- Create table for teacher file submissions
CREATE TABLE public.teacher_file_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES public.file_upload_requirements(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected
  notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, requirement_id)
);

-- Enable RLS
ALTER TABLE public.file_upload_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_file_submissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for file_upload_requirements
CREATE POLICY "Anyone can view active requirements" 
ON public.file_upload_requirements 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Authenticated users can manage requirements" 
ON public.file_upload_requirements 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- RLS policies for teacher_file_submissions (public can insert, authenticated can manage)
CREATE POLICY "Anyone can insert submissions" 
ON public.teacher_file_submissions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can view their own submissions by teacher_id" 
ON public.teacher_file_submissions 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage all submissions" 
ON public.teacher_file_submissions 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create updated_at triggers
CREATE TRIGGER update_file_upload_requirements_updated_at
BEFORE UPDATE ON public.file_upload_requirements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_teacher_file_submissions_updated_at
BEFORE UPDATE ON public.teacher_file_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for teacher uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('teacher-uploads', 'teacher-uploads', true);

-- Storage policies
CREATE POLICY "Anyone can upload teacher files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'teacher-uploads');

CREATE POLICY "Anyone can view teacher files"
ON storage.objects FOR SELECT
USING (bucket_id = 'teacher-uploads');

CREATE POLICY "Authenticated users can delete teacher files"
ON storage.objects FOR DELETE
USING (bucket_id = 'teacher-uploads' AND auth.uid() IS NOT NULL);