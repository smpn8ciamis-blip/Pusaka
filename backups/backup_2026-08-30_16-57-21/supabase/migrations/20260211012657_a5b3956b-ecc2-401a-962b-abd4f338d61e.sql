
-- Create processing_jobs table for background export tasks
CREATE TABLE public.processing_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'processing',
  progress INTEGER DEFAULT 0,
  result TEXT,
  error TEXT,
  user_id UUID,
  school_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- Only the user who created the job can see it
CREATE POLICY "Users can view their own jobs"
ON public.processing_jobs FOR SELECT
USING (auth.uid() = user_id);

-- Allow authenticated users to insert jobs
CREATE POLICY "Authenticated users can create jobs"
ON public.processing_jobs FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Service role can update jobs (used by edge function)
CREATE POLICY "Service role can update jobs"
ON public.processing_jobs FOR UPDATE
USING (true);

-- Auto-cleanup old jobs after 24 hours (optional trigger)
CREATE OR REPLACE FUNCTION public.update_processing_job_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_processing_jobs_updated_at
BEFORE UPDATE ON public.processing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_processing_job_timestamp();
