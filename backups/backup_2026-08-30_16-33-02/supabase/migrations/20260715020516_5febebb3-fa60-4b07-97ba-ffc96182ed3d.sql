ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS instagram_username text,
  ADD COLUMN IF NOT EXISTS instagram_post_urls text,
  ADD COLUMN IF NOT EXISTS instagram_section_title text DEFAULT 'Ikuti Instagram Kami',
  ADD COLUMN IF NOT EXISTS instagram_section_enabled boolean DEFAULT true;