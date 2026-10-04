
-- 1. Create subscription_plans table for editable plan presets
CREATE TABLE public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  max_students INTEGER NOT NULL DEFAULT 100,
  max_teachers INTEGER NOT NULL DEFAULT 20,
  duration_months INTEGER NOT NULL DEFAULT 1,
  monthly_price INTEGER NOT NULL DEFAULT 0,
  features TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage plans
CREATE POLICY "Super admins can manage plans"
  ON public.subscription_plans FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Everyone can read active plans (for registration page)
CREATE POLICY "Anyone can read active plans"
  ON public.subscription_plans FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Seed default plans
INSERT INTO public.subscription_plans (plan_key, label, description, max_students, max_teachers, duration_months, monthly_price, features, sort_order) VALUES
('starter', 'Starter', 'Fitur dasar absensi & jadwal', 200, 20, 1, 150000, ARRAY['attendance','schedules','students','teachers','classes','announcements'], 1),
('standard', 'Standard', 'Nilai, pelanggaran, surat & jurnal', 500, 50, 1, 350000, ARRAY['attendance','schedules','students','teachers','classes','announcements','grades','violations','journals','letters','complaints','achievements','exams','habit_journal','polling'], 2),
('premium', 'Premium', 'Keuangan, honorarium, pajak & arsip', 1500, 100, 1, 750000, ARRAY['attendance','schedules','students','teachers','classes','announcements','grades','violations','journals','letters','complaints','achievements','exams','habit_journal','polling','finance','honorarium','tax','archive','alumni','analytics','file_upload','worker_payments','official_travel','cash_audit','rkas','spj'], 3),
('enterprise', 'Enterprise', 'Semua fitur + backup & integrasi', 9999, 9999, 1, 1500000, ARRAY['attendance','schedules','students','teachers','classes','announcements','grades','violations','journals','letters','complaints','achievements','exams','habit_journal','polling','finance','honorarium','tax','archive','alumni','analytics','file_upload','worker_payments','official_travel','cash_audit','rkas','spj','backup','zapier'], 4);

-- 2. Add approval_status and selected_plan to schools
ALTER TABLE public.schools 
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS selected_plan_key TEXT;

-- Set existing schools to approved
UPDATE public.schools SET approval_status = 'approved' WHERE approval_status = 'pending';

-- Trigger for updated_at
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
