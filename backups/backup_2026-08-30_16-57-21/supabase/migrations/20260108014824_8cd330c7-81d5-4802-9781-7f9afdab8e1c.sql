-- Create polling_positions table (jenis jabatan yang dipolling)
CREATE TABLE public.polling_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  max_candidates INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Create polling_candidates table
CREATE TABLE public.polling_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  position_id UUID NOT NULL REFERENCES public.polling_positions(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  vote_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(position_id, teacher_id)
);

-- Create polling_sessions table
CREATE TABLE public.polling_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  position_id UUID NOT NULL REFERENCES public.polling_positions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Create polling_votes table
CREATE TABLE public.polling_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.polling_sessions(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.polling_candidates(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL,
  voted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, voter_id)
);

-- Enable RLS
ALTER TABLE public.polling_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polling_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polling_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polling_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for polling_positions
CREATE POLICY "Polling users can manage positions"
ON public.polling_positions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'polling') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'polling') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view active positions"
ON public.polling_positions
FOR SELECT
TO authenticated
USING (is_active = true);

-- RLS Policies for polling_candidates
CREATE POLICY "Polling users can manage candidates"
ON public.polling_candidates
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'polling') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'polling') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view active candidates"
ON public.polling_candidates
FOR SELECT
TO authenticated
USING (is_active = true);

-- RLS Policies for polling_sessions
CREATE POLICY "Polling users can manage sessions"
ON public.polling_sessions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'polling') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'polling') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can view active sessions"
ON public.polling_sessions
FOR SELECT
TO authenticated
USING (is_active = true OR status = 'active');

-- RLS Policies for polling_votes
CREATE POLICY "Polling users can view all votes"
ON public.polling_votes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'polling') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own vote"
ON public.polling_votes
FOR INSERT
TO authenticated
WITH CHECK (voter_id = auth.uid());

-- Create triggers for updated_at
CREATE TRIGGER update_polling_positions_updated_at
BEFORE UPDATE ON public.polling_positions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_polling_candidates_updated_at
BEFORE UPDATE ON public.polling_candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_polling_sessions_updated_at
BEFORE UPDATE ON public.polling_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();