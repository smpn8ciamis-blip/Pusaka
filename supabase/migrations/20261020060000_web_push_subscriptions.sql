-- Langganan Web Push (notifikasi layar kunci) per perangkat/browser pengguna. Dikirim oleh bot (server.js) saat absen tercatat.
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_web_push_user ON public.web_push_subscriptions(user_id);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_push_subscriptions TO authenticated;
GRANT ALL ON public.web_push_subscriptions TO service_role;

DROP POLICY IF EXISTS "web_push_own" ON public.web_push_subscriptions;
CREATE POLICY "web_push_own" ON public.web_push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
