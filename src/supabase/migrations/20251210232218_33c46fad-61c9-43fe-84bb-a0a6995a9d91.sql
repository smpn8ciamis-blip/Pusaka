-- Create table for important event notes
CREATE TABLE public.important_event_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'umum',
  severity TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.important_event_notes ENABLE ROW LEVEL SECURITY;

-- Admins can manage all notes
CREATE POLICY "Admins can manage all event notes"
ON public.important_event_notes
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Teachers can view their own notes
CREATE POLICY "Teachers can view their own notes"
ON public.important_event_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.id = important_event_notes.teacher_id
    AND t.user_id = auth.uid()
  )
);

-- Teachers can create their own notes
CREATE POLICY "Teachers can create their own notes"
ON public.important_event_notes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.id = important_event_notes.teacher_id
    AND t.user_id = auth.uid()
  )
);

-- Teachers can update their own notes
CREATE POLICY "Teachers can update their own notes"
ON public.important_event_notes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.id = important_event_notes.teacher_id
    AND t.user_id = auth.uid()
  )
);

-- Teachers can delete their own notes
CREATE POLICY "Teachers can delete their own notes"
ON public.important_event_notes
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.id = important_event_notes.teacher_id
    AND t.user_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_important_event_notes_updated_at
BEFORE UPDATE ON public.important_event_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();