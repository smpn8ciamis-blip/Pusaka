-- Create sync_logs table to track synchronization history
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  sync_type TEXT NOT NULL, -- 'MANUAL_SYNC' or 'AUTO_SYNC'
  records_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, -- 'success' or 'failed'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all sync logs
CREATE POLICY "Admins can view all sync logs"
ON public.sync_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert sync logs
CREATE POLICY "Admins can insert sync logs"
ON public.sync_logs
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster queries
CREATE INDEX idx_sync_logs_table_name ON public.sync_logs(table_name);
CREATE INDEX idx_sync_logs_created_at ON public.sync_logs(created_at DESC);