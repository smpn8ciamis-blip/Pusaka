ALTER TABLE public.students ADD COLUMN IF NOT EXISTS telegram_chat_id text;

CREATE TABLE IF NOT EXISTS public.telegram_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid,
  enabled boolean NOT NULL DEFAULT false,
  bot_token text,
  bot_username text,
  notify_check_in boolean NOT NULL DEFAULT true,
  notify_check_out boolean NOT NULL DEFAULT true,
  message_template text NOT NULL DEFAULT 'Yth. Orang Tua/Wali {nama}, ananda tercatat {tipe} pada {waktu} ({tanggal}) dengan status {status}. Terima kasih.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_settings TO authenticated;
GRANT ALL ON public.telegram_settings TO service_role;

ALTER TABLE public.telegram_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage telegram settings" ON public.telegram_settings;
CREATE POLICY "Admins manage telegram settings"
ON public.telegram_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

DROP TRIGGER IF EXISTS update_telegram_settings_updated_at ON public.telegram_settings;
CREATE TRIGGER update_telegram_settings_updated_at
BEFORE UPDATE ON public.telegram_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_telegram_bot_info()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object('enabled', s.enabled, 'bot_username', s.bot_username)
  FROM public.telegram_settings s
  ORDER BY s.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_my_telegram_chat_id(_chat_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid;
BEGIN
  SELECT student_id INTO v_student FROM public.student_accounts WHERE user_id = auth.uid() LIMIT 1;
  IF v_student IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.students
  SET telegram_chat_id = NULLIF(btrim(COALESCE(_chat_id, '')), '')
  WHERE id = v_student;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_telegram_chat_id()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.telegram_chat_id
  FROM public.students s
  JOIN public.student_accounts sa ON sa.student_id = s.id
  WHERE sa.user_id = auth.uid()
  LIMIT 1;
$$;