
-- Create school_subscriptions table for billing management
CREATE TABLE public.school_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  max_students INTEGER DEFAULT 100,
  max_teachers INTEGER DEFAULT 20,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id)
);

-- Enable RLS
ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;

-- Super admin can do everything
CREATE POLICY "Super admin full access on subscriptions"
  ON public.school_subscriptions
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- School admins can view their own subscription
CREATE POLICY "School admin can view own subscription"
  ON public.school_subscriptions
  FOR SELECT
  TO authenticated
  USING (school_id = public.get_user_school_id());

-- Trigger for updated_at
CREATE TRIGGER update_school_subscriptions_updated_at
  BEFORE UPDATE ON public.school_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check if user's school subscription is active
CREATE OR REPLACE FUNCTION public.is_school_subscription_active()
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT 
      CASE 
        WHEN s.status = 'active' AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE) THEN true
        ELSE false
      END
    FROM public.school_subscriptions s
    WHERE s.school_id = public.get_user_school_id()
    LIMIT 1),
    true -- Default to true if no subscription record (free tier)
  )
$$;
