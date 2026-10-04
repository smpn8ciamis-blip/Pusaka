-- Create table for manual executors (pelaksana manual) that are not in teachers database
CREATE TABLE public.assignment_letter_manual_executors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_letter_id uuid NOT NULL REFERENCES public.assignment_letters(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  nip text,
  pangkat_golongan text,
  jabatan text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assignment_letter_manual_executors ENABLE ROW LEVEL SECURITY;

-- RLS policies for bendahara
CREATE POLICY "Bendahara can manage manual executors"
ON public.assignment_letter_manual_executors
FOR ALL
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- RLS policies for admin view
CREATE POLICY "Admins can view manual executors"
ON public.assignment_letter_manual_executors
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));