-- Create complaints table for violence reports, criticism, and suggestions
CREATE TABLE public.complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('kekerasan', 'kritik', 'saran')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reporter_name TEXT,
  reporter_contact TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_by UUID REFERENCES auth.users(id),
  response_notes TEXT,
  response_date TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can submit complaints (including anonymous users)
CREATE POLICY "Anyone can submit complaints"
ON public.complaints
FOR INSERT
WITH CHECK (true);

-- Policy: Admins can view all complaints
CREATE POLICY "Admins can view all complaints"
ON public.complaints
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Policy: Admins can update complaints (status, response)
CREATE POLICY "Admins can update complaints"
ON public.complaints
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Policy: Admins can delete complaints
CREATE POLICY "Admins can delete complaints"
ON public.complaints
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_complaints_updated_at
BEFORE UPDATE ON public.complaints
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_complaints_type ON public.complaints(type);
CREATE INDEX idx_complaints_status ON public.complaints(status);
CREATE INDEX idx_complaints_created_at ON public.complaints(created_at DESC);