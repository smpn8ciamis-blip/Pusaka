
CREATE TABLE public.portal_tautan_guru_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Portal Tautan Guru',
  subtitle text DEFAULT 'Pusat Tautan untuk Guru',
  description text DEFAULT 'Kumpulan tautan penting yang memudahkan guru mengakses berbagai layanan dan sumber belajar.',
  accent_color text DEFAULT '#0ea5e9',
  background_style text DEFAULT 'gradient',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_tautan_guru_settings TO authenticated;
GRANT SELECT ON public.portal_tautan_guru_settings TO anon;
GRANT ALL ON public.portal_tautan_guru_settings TO service_role;
ALTER TABLE public.portal_tautan_guru_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage portal guru settings" ON public.portal_tautan_guru_settings
  TO authenticated USING (((school_id = get_user_school_id()) AND has_role(auth.uid(),'admin'::app_role)) OR is_super_admin())
  WITH CHECK (((school_id = get_user_school_id()) AND has_role(auth.uid(),'admin'::app_role)) OR is_super_admin());
CREATE POLICY "Public can view portal guru settings" ON public.portal_tautan_guru_settings FOR SELECT TO anon USING (true);
CREATE POLICY "View portal guru settings same school" ON public.portal_tautan_guru_settings FOR SELECT TO authenticated
  USING ((school_id = get_user_school_id()) OR is_super_admin());
CREATE TRIGGER set_portal_tautan_guru_settings_school_id BEFORE INSERT ON public.portal_tautan_guru_settings
  FOR EACH ROW EXECUTE FUNCTION auto_set_school_id();
CREATE TRIGGER update_portal_tautan_guru_settings_updated_at BEFORE UPDATE ON public.portal_tautan_guru_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.portal_tautan_guru_buttons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  description text,
  icon text DEFAULT 'Link',
  color text DEFAULT '#0ea5e9',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  schedule_start timestamptz,
  schedule_end timestamptz,
  open_in_new_tab boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_tautan_guru_buttons_school ON public.portal_tautan_guru_buttons(school_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_tautan_guru_buttons TO authenticated;
GRANT SELECT ON public.portal_tautan_guru_buttons TO anon;
GRANT ALL ON public.portal_tautan_guru_buttons TO service_role;
ALTER TABLE public.portal_tautan_guru_buttons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage portal guru buttons" ON public.portal_tautan_guru_buttons
  TO authenticated USING (((school_id = get_user_school_id()) AND has_role(auth.uid(),'admin'::app_role)) OR is_super_admin())
  WITH CHECK (((school_id = get_user_school_id()) AND has_role(auth.uid(),'admin'::app_role)) OR is_super_admin());
CREATE POLICY "Public can view portal guru buttons" ON public.portal_tautan_guru_buttons FOR SELECT TO anon USING (true);
CREATE POLICY "View portal guru buttons same school" ON public.portal_tautan_guru_buttons FOR SELECT TO authenticated
  USING ((school_id = get_user_school_id()) OR is_super_admin());
CREATE TRIGGER set_portal_tautan_guru_buttons_school_id BEFORE INSERT ON public.portal_tautan_guru_buttons
  FOR EACH ROW EXECUTE FUNCTION auto_set_school_id();
CREATE TRIGGER update_portal_tautan_guru_buttons_updated_at BEFORE UPDATE ON public.portal_tautan_guru_buttons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
