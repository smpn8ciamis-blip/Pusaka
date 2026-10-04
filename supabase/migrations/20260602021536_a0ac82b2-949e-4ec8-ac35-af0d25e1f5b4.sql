
-- Settings table (one row per school)
CREATE TABLE public.nedelcis_hub_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Nedelcis Hub',
  subtitle text DEFAULT 'Pusat Akses Cepat',
  description text DEFAULT 'Kumpulan tautan penting untuk memudahkan akses berbagai layanan sekolah.',
  accent_color text DEFAULT '#6366f1',
  background_style text DEFAULT 'gradient',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nedelcis_hub_settings TO authenticated;
GRANT ALL ON public.nedelcis_hub_settings TO service_role;

ALTER TABLE public.nedelcis_hub_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View hub settings same school"
ON public.nedelcis_hub_settings FOR SELECT TO authenticated
USING (school_id = public.get_user_school_id() OR public.is_super_admin());

CREATE POLICY "Admins manage hub settings"
ON public.nedelcis_hub_settings FOR ALL TO authenticated
USING (
  (school_id = public.get_user_school_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  OR public.is_super_admin()
)
WITH CHECK (
  (school_id = public.get_user_school_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  OR public.is_super_admin()
);

CREATE TRIGGER set_nedelcis_hub_settings_school_id
BEFORE INSERT ON public.nedelcis_hub_settings
FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

CREATE TRIGGER update_nedelcis_hub_settings_updated_at
BEFORE UPDATE ON public.nedelcis_hub_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Buttons table
CREATE TABLE public.nedelcis_hub_buttons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  description text,
  icon text DEFAULT 'Link',
  color text DEFAULT '#6366f1',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  schedule_start timestamptz,
  schedule_end timestamptz,
  open_in_new_tab boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nedelcis_hub_buttons_school ON public.nedelcis_hub_buttons(school_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nedelcis_hub_buttons TO authenticated;
GRANT ALL ON public.nedelcis_hub_buttons TO service_role;

ALTER TABLE public.nedelcis_hub_buttons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View hub buttons same school"
ON public.nedelcis_hub_buttons FOR SELECT TO authenticated
USING (school_id = public.get_user_school_id() OR public.is_super_admin());

CREATE POLICY "Admins manage hub buttons"
ON public.nedelcis_hub_buttons FOR ALL TO authenticated
USING (
  (school_id = public.get_user_school_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  OR public.is_super_admin()
)
WITH CHECK (
  (school_id = public.get_user_school_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  OR public.is_super_admin()
);

CREATE TRIGGER set_nedelcis_hub_buttons_school_id
BEFORE INSERT ON public.nedelcis_hub_buttons
FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

CREATE TRIGGER update_nedelcis_hub_buttons_updated_at
BEFORE UPDATE ON public.nedelcis_hub_buttons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
