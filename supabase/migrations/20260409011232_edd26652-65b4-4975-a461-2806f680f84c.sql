
-- Guest Book table
CREATE TABLE public.guest_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_name TEXT NOT NULL,
  visitor_phone TEXT,
  visitor_institution TEXT,
  purpose TEXT NOT NULL,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_time TIME,
  departure_time TIME,
  notes TEXT,
  recorded_by UUID,
  school_id UUID REFERENCES public.schools(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_book ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view guest book" ON public.guest_book FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert guest book" ON public.guest_book FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update guest book" ON public.guest_book FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete guest book" ON public.guest_book FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_guest_book_school_id BEFORE INSERT ON public.guest_book FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER update_guest_book_updated_at BEFORE UPDATE ON public.guest_book FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Graduation Announcement Settings table
CREATE TABLE public.graduation_announcement_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  open_datetime TIMESTAMPTZ,
  close_datetime TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT false,
  message TEXT,
  school_id UUID REFERENCES public.schools(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.graduation_announcement_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view graduation settings" ON public.graduation_announcement_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert graduation settings" ON public.graduation_announcement_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update graduation settings" ON public.graduation_announcement_settings FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER set_graduation_settings_school_id BEFORE INSERT ON public.graduation_announcement_settings FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER update_graduation_settings_updated_at BEFORE UPDATE ON public.graduation_announcement_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
