
-- 2) Website settings
CREATE TABLE public.website_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  site_name TEXT NOT NULL DEFAULT 'Website Sekolah',
  tagline TEXT,
  about_short TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  whatsapp TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  youtube_url TEXT,
  tiktok_url TEXT,
  map_embed_url TEXT,
  meta_title TEXT,
  meta_description TEXT,
  meta_keywords TEXT,
  primary_color TEXT DEFAULT '#1E40AF',
  logo_url TEXT,
  favicon_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.website_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_settings TO authenticated;
GRANT ALL ON public.website_settings TO service_role;
ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view website settings" ON public.website_settings FOR SELECT USING (true);
CREATE POLICY "Admin web can manage settings" ON public.website_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_website_settings_updated BEFORE UPDATE ON public.website_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Hero slides
CREATE TABLE public.website_hero_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  cta_label TEXT,
  cta_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.website_hero_slides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_hero_slides TO authenticated;
GRANT ALL ON public.website_hero_slides TO service_role;
ALTER TABLE public.website_hero_slides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view active hero slides" ON public.website_hero_slides FOR SELECT USING (is_active = true);
CREATE POLICY "Admin web can manage hero slides" ON public.website_hero_slides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_website_hero_slides_updated BEFORE UPDATE ON public.website_hero_slides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Pages
CREATE TABLE public.website_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  cover_image_url TEXT,
  section TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.website_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_pages TO authenticated;
GRANT ALL ON public.website_pages TO service_role;
ALTER TABLE public.website_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published pages" ON public.website_pages FOR SELECT USING (is_published = true);
CREATE POLICY "Admin web can manage pages" ON public.website_pages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_website_pages_updated BEFORE UPDATE ON public.website_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) News categories
CREATE TABLE public.website_news_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT DEFAULT '#1E40AF',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.website_news_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_news_categories TO authenticated;
GRANT ALL ON public.website_news_categories TO service_role;
ALTER TABLE public.website_news_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view news categories" ON public.website_news_categories FOR SELECT USING (true);
CREATE POLICY "Admin web can manage news categories" ON public.website_news_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 6) News
CREATE TABLE public.website_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT,
  cover_image_url TEXT,
  category_id UUID REFERENCES public.website_news_categories(id) ON DELETE SET NULL,
  author_name TEXT,
  author_id UUID,
  status TEXT NOT NULL DEFAULT 'draft',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  view_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX website_news_status_idx ON public.website_news (status, published_at DESC);
GRANT SELECT ON public.website_news TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_news TO authenticated;
GRANT ALL ON public.website_news TO service_role;
ALTER TABLE public.website_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published news" ON public.website_news FOR SELECT USING (status = 'published');
CREATE POLICY "Admin web can manage news" ON public.website_news FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_website_news_updated BEFORE UPDATE ON public.website_news FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Gallery
CREATE TABLE public.website_gallery_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  event_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.website_gallery_albums TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_gallery_albums TO authenticated;
GRANT ALL ON public.website_gallery_albums TO service_role;
ALTER TABLE public.website_gallery_albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published albums" ON public.website_gallery_albums FOR SELECT USING (is_published = true);
CREATE POLICY "Admin web can manage albums" ON public.website_gallery_albums FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_website_gallery_albums_updated BEFORE UPDATE ON public.website_gallery_albums FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.website_gallery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID REFERENCES public.website_gallery_albums(id) ON DELETE CASCADE,
  school_id UUID,
  media_type TEXT NOT NULL DEFAULT 'image',
  media_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.website_gallery_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_gallery_items TO authenticated;
GRANT ALL ON public.website_gallery_items TO service_role;
ALTER TABLE public.website_gallery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view gallery items" ON public.website_gallery_items FOR SELECT USING (true);
CREATE POLICY "Admin web can manage gallery items" ON public.website_gallery_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 8) Agenda
CREATE TABLE public.website_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  location TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.website_agenda TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_agenda TO authenticated;
GRANT ALL ON public.website_agenda TO service_role;
ALTER TABLE public.website_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published agenda" ON public.website_agenda FOR SELECT USING (is_published = true);
CREATE POLICY "Admin web can manage agenda" ON public.website_agenda FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_website_agenda_updated BEFORE UPDATE ON public.website_agenda FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9) Programs
CREATE TABLE public.website_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  cover_image_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.website_programs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_programs TO authenticated;
GRANT ALL ON public.website_programs TO service_role;
ALTER TABLE public.website_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published programs" ON public.website_programs FOR SELECT USING (is_published = true);
CREATE POLICY "Admin web can manage programs" ON public.website_programs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_website_programs_updated BEFORE UPDATE ON public.website_programs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10) Contact messages
CREATE TABLE public.website_contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.website_contact_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_contact_messages TO authenticated;
GRANT ALL ON public.website_contact_messages TO service_role;
ALTER TABLE public.website_contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit contact message" ON public.website_contact_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin web can view messages" ON public.website_contact_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin web can update messages" ON public.website_contact_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admin web can delete messages" ON public.website_contact_messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin_web') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 11) Seed
INSERT INTO public.website_settings (site_name, tagline, about_short, meta_title, meta_description, address, phone, email)
SELECT 'Nedelcis School', 'Sekolah Modern, Berkarakter, dan Berprestasi',
       'Membentuk generasi cerdas, berakhlak mulia, dan siap menghadapi tantangan zaman.',
       'Nedelcis School — Sekolah Modern & Berkarakter',
       'Website resmi Nedelcis School. Informasi profil, berita, akademik, ekstrakurikuler, dan pendaftaran.',
       'Jl. Pendidikan No. 1, Indonesia', '(021) 000-0000', 'info@nedelcis.sch.id'
WHERE NOT EXISTS (SELECT 1 FROM public.website_settings);

INSERT INTO public.website_pages (slug, title, content, section, sort_order)
SELECT * FROM (VALUES
  ('sejarah', 'Sejarah Sekolah', 'Nedelcis School didirikan dengan visi menghadirkan pendidikan modern berbasis karakter dan teknologi. Sejak berdirinya, kami konsisten mengembangkan kurikulum yang seimbang antara akademik, spiritual, dan keterampilan hidup.', 'sejarah', 1),
  ('visi-misi', 'Visi & Misi', E'Visi\nMenjadi lembaga pendidikan unggul yang mencetak generasi berilmu, beriman, dan berkarakter.\n\nMisi\n1. Menyelenggarakan pendidikan berkualitas berbasis nilai keislaman.\n2. Mengembangkan potensi akademik dan non-akademik peserta didik.\n3. Membangun budaya sekolah yang inovatif dan kolaboratif.\n4. Menghasilkan lulusan yang siap bersaing di era global.', 'visi-misi', 2),
  ('sambutan', 'Sambutan Kepala Sekolah', 'Assalamualaikum warahmatullahi wabarakatuh. Selamat datang di website resmi Nedelcis School. Kami berkomitmen memberikan layanan pendidikan terbaik demi mencerdaskan kehidupan bangsa.', 'sambutan', 3),
  ('fasilitas', 'Fasilitas Sekolah', 'Ruang kelas ber-AC, laboratorium komputer & IPA, perpustakaan digital, masjid, lapangan olahraga, kantin sehat, dan area hijau.', 'fasilitas', 4),
  ('struktur', 'Struktur Organisasi', 'Kepala Sekolah, Wakil Kepala Sekolah bidang Kurikulum, Kesiswaan, Sarana Prasarana, dan Humas, didukung oleh tenaga pendidik profesional.', 'struktur', 5)
) AS v(slug, title, content, section, sort_order);

INSERT INTO public.website_news_categories (name, slug, color) VALUES
  ('Pengumuman', 'pengumuman', '#1E40AF'),
  ('Kegiatan', 'kegiatan', '#059669'),
  ('Prestasi', 'prestasi', '#D97706'),
  ('Akademik', 'akademik', '#7C3AED');

INSERT INTO public.website_programs (name, slug, description, icon, sort_order) VALUES
  ('Kurikulum Merdeka', 'kurikulum-merdeka', 'Menerapkan Kurikulum Merdeka dengan pendekatan pembelajaran berdiferensiasi dan projek penguatan profil pelajar Pancasila.', 'BookOpen', 1),
  ('Tahfidz Al-Quran', 'tahfidz', 'Program unggulan tahfidz Al-Quran dengan target hafalan bertingkat serta pembinaan tahsin harian.', 'Book', 2),
  ('Digital & Coding', 'digital-coding', 'Pembelajaran literasi digital, coding dasar, dan pemanfaatan teknologi untuk pembelajaran.', 'Code', 3),
  ('Bahasa Asing', 'bahasa-asing', 'Penguatan Bahasa Inggris dan Arab melalui English/Arabic Day, klub bahasa, dan native speaker.', 'Languages', 4);
