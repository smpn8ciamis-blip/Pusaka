-- ============================================================
-- Jurnal & Anggota Ekstrakurikuler (role: pembina_ekskul)
--
-- * extracurricular_coaches          : pemetaan akun pembina -> ekskul yang dibina
-- * extracurricular_members          : daftar siswa anggota ekskul
-- * extracurricular_journals         : jurnal tiap pertemuan
-- * extracurricular_journal_photos   : foto kegiatan tiap pertemuan
-- * bucket storage privat 'ekskul-journal-photos'
--
-- Hak akses:
--   pembina_ekskul : CRUD penuh, hanya untuk ekskul yang ditugaskan kepadanya
--   admin          : CRUD penuh (termasuk penugasan pembina)
--   kesiswaan      : hanya melihat
-- ============================================================

-- ------------------------------------------------------------
-- Helper functions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_ekskul_coach(_type_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.extracurricular_coaches c
    WHERE c.user_id = auth.uid()
      AND c.extracurricular_type_id = _type_id
  )
$$;

CREATE OR REPLACE FUNCTION public.student_in_my_school(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = _student_id
      AND s.school_id = public.get_user_school_id()
  )
$$;

-- Path storage: {school_id}/{extracurricular_type_id}/{journal_id}/{file}
CREATE OR REPLACE FUNCTION public.is_ekskul_coach_for_path(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN split_part(_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.is_ekskul_coach(split_part(_name, '/', 2)::uuid)
    ELSE false
  END
$$;

-- ------------------------------------------------------------
-- Tabel
-- ------------------------------------------------------------
CREATE TABLE public.extracurricular_coaches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  extracurricular_type_id uuid NOT NULL REFERENCES public.extracurricular_types(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, extracurricular_type_id)
);

CREATE TABLE public.extracurricular_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  extracurricular_type_id uuid NOT NULL REFERENCES public.extracurricular_types(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif', 'keluar')),
  joined_at date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  school_id uuid REFERENCES public.schools(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (extracurricular_type_id, student_id)
);

CREATE TABLE public.extracurricular_journals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  extracurricular_type_id uuid NOT NULL REFERENCES public.extracurricular_types(id) ON DELETE CASCADE,
  meeting_date date NOT NULL DEFAULT CURRENT_DATE,
  start_time time,
  end_time time,
  title text NOT NULL,
  activity_description text NOT NULL,
  location text,
  evaluation text,
  students_present integer NOT NULL DEFAULT 0 CHECK (students_present >= 0),
  students_absent integer NOT NULL DEFAULT 0 CHECK (students_absent >= 0),
  author_name text,
  school_id uuid REFERENCES public.schools(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.extracurricular_journal_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_id uuid NOT NULL REFERENCES public.extracurricular_journals(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text,
  caption text,
  file_size integer,
  school_id uuid REFERENCES public.schools(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ekskul_coaches_user ON public.extracurricular_coaches(user_id);
CREATE INDEX idx_ekskul_coaches_type ON public.extracurricular_coaches(extracurricular_type_id);
CREATE INDEX idx_ekskul_members_type ON public.extracurricular_members(extracurricular_type_id);
CREATE INDEX idx_ekskul_members_student ON public.extracurricular_members(student_id);
CREATE INDEX idx_ekskul_journals_type_date ON public.extracurricular_journals(extracurricular_type_id, meeting_date DESC);
CREATE INDEX idx_ekskul_journals_school ON public.extracurricular_journals(school_id);
CREATE INDEX idx_ekskul_photos_journal ON public.extracurricular_journal_photos(journal_id);

-- ------------------------------------------------------------
-- Trigger: school_id otomatis, updated_at, nama penulis jurnal
-- ------------------------------------------------------------
CREATE TRIGGER auto_set_school_id_ekskul_coaches
  BEFORE INSERT ON public.extracurricular_coaches
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_ekskul_members
  BEFORE INSERT ON public.extracurricular_members
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_ekskul_journals
  BEFORE INSERT ON public.extracurricular_journals
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
CREATE TRIGGER auto_set_school_id_ekskul_photos
  BEFORE INSERT ON public.extracurricular_journal_photos
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

CREATE TRIGGER update_ekskul_members_updated_at
  BEFORE UPDATE ON public.extracurricular_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ekskul_journals_updated_at
  BEFORE UPDATE ON public.extracurricular_journals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_ekskul_journal_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.author_name IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT p.full_name INTO NEW.author_name FROM public.profiles p WHERE p.id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_ekskul_journal_author_trg
  BEFORE INSERT ON public.extracurricular_journals
  FOR EACH ROW EXECUTE FUNCTION public.set_ekskul_journal_author();

-- ------------------------------------------------------------
-- Grants + RLS
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.extracurricular_coaches,
  public.extracurricular_members,
  public.extracurricular_journals,
  public.extracurricular_journal_photos
TO authenticated;
GRANT ALL ON
  public.extracurricular_coaches,
  public.extracurricular_members,
  public.extracurricular_journals,
  public.extracurricular_journal_photos
TO service_role;

ALTER TABLE public.extracurricular_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracurricular_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracurricular_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracurricular_journal_photos ENABLE ROW LEVEL SECURITY;

-- Isolasi antar sekolah (pola yang sama dengan tabel lain)
CREATE POLICY "school_isolation_ekskul_coaches" ON public.extracurricular_coaches
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "school_isolation_ekskul_members" ON public.extracurricular_members
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "school_isolation_ekskul_journals" ON public.extracurricular_journals
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());
CREATE POLICY "school_isolation_ekskul_photos" ON public.extracurricular_journal_photos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

-- ---- coaches ------------------------------------------------
CREATE POLICY "ekskul_coaches_select" ON public.extracurricular_coaches
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR public.is_super_admin()
  );
CREATE POLICY "ekskul_coaches_admin_write" ON public.extracurricular_coaches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

-- ---- members ------------------------------------------------
CREATE POLICY "ekskul_members_select" ON public.extracurricular_members
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR public.is_super_admin()
    OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(extracurricular_type_id))
  );
CREATE POLICY "ekskul_members_write" ON public.extracurricular_members
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(extracurricular_type_id))
  )
  WITH CHECK (
    public.student_in_my_school(student_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(extracurricular_type_id))
    )
  );

-- ---- journals -----------------------------------------------
CREATE POLICY "ekskul_journals_select" ON public.extracurricular_journals
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR public.is_super_admin()
    OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(extracurricular_type_id))
  );
CREATE POLICY "ekskul_journals_write" ON public.extracurricular_journals
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(extracurricular_type_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(extracurricular_type_id))
  );

-- ---- photos -------------------------------------------------
CREATE POLICY "ekskul_photos_select" ON public.extracurricular_journal_photos
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.extracurricular_journals j
      WHERE j.id = journal_id
        AND public.has_role(auth.uid(), 'pembina_ekskul')
        AND public.is_ekskul_coach(j.extracurricular_type_id)
    )
  );
CREATE POLICY "ekskul_photos_write" ON public.extracurricular_journal_photos
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.extracurricular_journals j
      WHERE j.id = journal_id
        AND public.has_role(auth.uid(), 'pembina_ekskul')
        AND public.is_ekskul_coach(j.extracurricular_type_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.extracurricular_journals j
      WHERE j.id = journal_id
        AND public.has_role(auth.uid(), 'pembina_ekskul')
        AND public.is_ekskul_coach(j.extracurricular_type_id)
    )
  );

-- ------------------------------------------------------------
-- RPC: pembina tidak punya akses langsung ke tabel students
-- (berisi alamat & telepon orang tua), jadi data siswa yang
-- dibutuhkan diambil lewat fungsi yang hanya mengembalikan kolom minimal.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ekskul_members(_type_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  extracurricular_type_id uuid,
  student_id uuid,
  status text,
  joined_at date,
  notes text,
  full_name text,
  nis text,
  gender text,
  class_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.extracurricular_type_id, m.student_id, m.status, m.joined_at, m.notes,
    s.full_name, s.nis, s.gender, c.name AS class_name
  FROM public.extracurricular_members m
  JOIN public.students s ON s.id = m.student_id
  LEFT JOIN public.classes c ON c.id = s.class_id
  WHERE (_type_id IS NULL OR m.extracurricular_type_id = _type_id)
    AND (m.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'kesiswaan')
      OR public.is_super_admin()
      OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(m.extracurricular_type_id))
    )
  ORDER BY c.name NULLS LAST, s.full_name
$$;

CREATE OR REPLACE FUNCTION public.get_ekskul_student_directory(_type_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  nis text,
  nisn text,
  gender text,
  class_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.full_name, s.nis, s.nisn, s.gender, c.name AS class_name
  FROM public.students s
  LEFT JOIN public.classes c ON c.id = s.class_id
  WHERE s.school_id = public.get_user_school_id()
    AND COALESCE(s.is_alumni, false) = false
    AND COALESCE(s.status, 'aktif') = 'aktif'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach(_type_id))
    )
  ORDER BY c.name NULLS LAST, s.full_name
$$;

-- Daftar akun pembina di sekolah ini (untuk penugasan oleh admin)
CREATE OR REPLACE FUNCTION public.list_pembina_ekskul_users()
RETURNS TABLE (user_id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id, p.full_name, p.email
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'pembina_ekskul'
    AND (ur.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  ORDER BY p.full_name
$$;

-- Nama pembina per ekskul (untuk tampilan admin/kesiswaan)
CREATE OR REPLACE FUNCTION public.get_ekskul_coaches()
RETURNS TABLE (id uuid, user_id uuid, extracurricular_type_id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.user_id, c.extracurricular_type_id, p.full_name, p.email
  FROM public.extracurricular_coaches c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE (c.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'kesiswaan')
      OR public.is_super_admin()
    )
  ORDER BY p.full_name
$$;

REVOKE ALL ON FUNCTION public.get_ekskul_members(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ekskul_student_directory(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_pembina_ekskul_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ekskul_coaches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ekskul_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ekskul_student_directory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pembina_ekskul_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ekskul_coaches() TO authenticated;

-- ------------------------------------------------------------
-- Storage: bucket privat, foto diakses lewat signed URL
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('ekskul-journal-photos', 'ekskul-journal-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ekskul photos select" ON storage.objects;
CREATE POLICY "ekskul photos select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ekskul-journal-photos'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = public.get_user_school_id()::text
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'kesiswaan')
          OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach_for_path(name))
        )
      )
    )
  );

DROP POLICY IF EXISTS "ekskul photos insert" ON storage.objects;
CREATE POLICY "ekskul photos insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ekskul-journal-photos'
    AND split_part(name, '/', 1) = public.get_user_school_id()::text
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach_for_path(name))
    )
  );

DROP POLICY IF EXISTS "ekskul photos delete" ON storage.objects;
CREATE POLICY "ekskul photos delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ekskul-journal-photos'
    AND split_part(name, '/', 1) = public.get_user_school_id()::text
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (public.has_role(auth.uid(), 'pembina_ekskul') AND public.is_ekskul_coach_for_path(name))
    )
  );
