-- Create table for popup notifications on login page
CREATE TABLE public.login_popup_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type TEXT NOT NULL DEFAULT 'info',
    is_active BOOLEAN NOT NULL DEFAULT true,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for global account lock settings
CREATE TABLE public.account_lock_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_locked BOOLEAN NOT NULL DEFAULT false,
    lock_message TEXT,
    locked_by UUID,
    locked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default account lock settings
INSERT INTO public.account_lock_settings (is_locked, lock_message) 
VALUES (false, 'Sistem sedang dalam pemeliharaan. Silakan coba lagi nanti.');

-- Enable RLS
ALTER TABLE public.login_popup_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_lock_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for login_popup_notifications
CREATE POLICY "Billing and Admin can manage popup notifications"
ON public.login_popup_notifications
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'billing'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'billing'));

-- RLS policies for account_lock_settings
CREATE POLICY "Billing and Admin can manage account lock"
ON public.account_lock_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'billing'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'billing'));

-- Create view for public access to active notifications (for login page)
CREATE VIEW public.active_login_notifications
WITH (security_invoker=off) AS
SELECT id, title, message, notification_type, start_date, end_date
FROM public.login_popup_notifications
WHERE is_active = true
AND (start_date IS NULL OR start_date <= now())
AND (end_date IS NULL OR end_date >= now())
ORDER BY created_at DESC;

-- Create view for public access to account lock status (for login page)
CREATE VIEW public.account_lock_status
WITH (security_invoker=off) AS
SELECT is_locked, lock_message
FROM public.account_lock_settings
ORDER BY created_at DESC
LIMIT 1;

-- Grant SELECT on views to anon and authenticated
GRANT SELECT ON public.active_login_notifications TO anon;
GRANT SELECT ON public.active_login_notifications TO authenticated;
GRANT SELECT ON public.account_lock_status TO anon;
GRANT SELECT ON public.account_lock_status TO authenticated;

-- Create trigger for updated_at
CREATE TRIGGER update_login_popup_notifications_updated_at
BEFORE UPDATE ON public.login_popup_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_account_lock_settings_updated_at
BEFORE UPDATE ON public.account_lock_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();