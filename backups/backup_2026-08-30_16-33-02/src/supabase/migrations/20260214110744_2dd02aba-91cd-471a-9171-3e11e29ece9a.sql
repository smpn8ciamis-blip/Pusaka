
-- Add allowed_features column to store active features per plan
ALTER TABLE public.school_subscriptions 
ADD COLUMN IF NOT EXISTS allowed_features text[] DEFAULT '{}';

-- Add monthly_price column
ALTER TABLE public.school_subscriptions 
ADD COLUMN IF NOT EXISTS monthly_price integer DEFAULT 0;
