ALTER TABLE public.website_settings ADD COLUMN IF NOT EXISTS show_lapor_button boolean NOT NULL DEFAULT true;
ALTER TABLE public.website_settings ADD COLUMN IF NOT EXISTS chatbot_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.website_settings ADD COLUMN IF NOT EXISTS chatbot_name text;
ALTER TABLE public.website_settings ADD COLUMN IF NOT EXISTS chatbot_welcome text;