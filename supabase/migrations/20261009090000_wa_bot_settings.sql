-- Pengaturan bot WhatsApp & template pesan (dikelola admin, dibaca bot via service role)
CREATE TABLE IF NOT EXISTS public.wa_message_templates (
  key text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.wa_bot_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  teacher_reminder_enabled boolean NOT NULL DEFAULT true,
  reminder_lead_min integer NOT NULL DEFAULT 10 CHECK (reminder_lead_min BETWEEN 1 AND 120),
  reminder_followup_min integer NOT NULL DEFAULT 15 CHECK (reminder_followup_min BETWEEN 1 AND 120),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.wa_bot_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.wa_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_bot_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage wa templates" ON public.wa_message_templates;
CREATE POLICY "Admins manage wa templates" ON public.wa_message_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Admins manage wa bot settings" ON public.wa_bot_settings;
CREATE POLICY "Admins manage wa bot settings" ON public.wa_bot_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
