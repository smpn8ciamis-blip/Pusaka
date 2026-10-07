-- ============================================================
-- Kesiswaan menugaskan guru sebagai pembina ekskul
--   * Guru dipilih dari database (tabel teachers) ATAU diketik manual
--   * Data pembina tersimpan di extracurricular_instructors
--     (dipakai untuk tanda tangan cetak jurnal/daftar hadir)
--   * Guru yang punya akun & dipilih dari database otomatis dicatat di
--     extracurricular_coaches -> akses penuh Jurnal Ekskul & Anggota Ekskul
--     untuk ekskul binaannya, tanpa mengubah role "teacher" miliknya
-- Jalankan setelah migrasi ekskul sebelumnya.
-- ============================================================

-- ---- 1) Relasi coach <-> instructor -------------------------
ALTER TABLE public.extracurricular_coaches
  ADD COLUMN IF NOT EXISTS instructor_id uuid
  REFERENCES public.extracurricular_instructors(id) ON DELETE SET NULL;

-- ---- 2) Akses berbasis PENUGASAN (bukan role) ---------------
-- is_ekskul_coach() sudah memeriksa tabel extracurricular_coaches,
-- jadi syarat role 'pembina_ekskul' dilepas agar guru (role teacher) bisa masuk.

-- Anggota
DROP POLICY IF EXISTS "ekskul_members_select" ON public.extracurricular_members;
CREATE POLICY "ekskul_members_select" ON public.extracurricular_members
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR public.is_super_admin()
    OR public.is_ekskul_coach(extracurricular_type_id)
  );

DROP POLICY IF EXISTS "ekskul_members_write" ON public.extracurricular_members;
CREATE POLICY "ekskul_members_write" ON public.extracurricular_members
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR public.is_ekskul_coach(extracurricular_type_id)
  )
  WITH CHECK (
    public.student_in_my_school(student_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'kesiswaan')
      OR public.is_ekskul_coach(extracurricular_type_id)
    )
  );

-- Jurnal
DROP POLICY IF EXISTS "ekskul_journals_select" ON public.extracurricular_journals;
CREATE POLICY "ekskul_journals_select" ON public.extracurricular_journals
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR public.is_super_admin()
    OR public.is_ekskul_coach(extracurricular_type_id)
  );

DROP POLICY IF EXISTS "ekskul_journals_write" ON public.extracurricular_journals;
CREATE POLICY "ekskul_journals_write" ON public.extracurricular_journals
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_ekskul_coach(extracurricular_type_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.is_ekskul_coach(extracurricular_type_id)
  );

-- Foto jurnal
DROP POLICY IF EXISTS "ekskul_photos_select" ON public.extracurricular_journal_photos;
CREATE POLICY "ekskul_photos_select" ON public.extracurricular_journal_photos
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.extracurricular_journals j
      WHERE j.id = journal_id
        AND public.is_ekskul_coach(j.extracurricular_type_id)
    )
  );

DROP POLICY IF EXISTS "ekskul_photos_write" ON public.extracurricular_journal_photos;
CREATE POLICY "ekskul_photos_write" ON public.extracurricular_journal_photos
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.extracurricular_journals j
      WHERE j.id = journal_id
        AND public.is_ekskul_coach(j.extracurricular_type_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.extracurricular_journals j
      WHERE j.id = journal_id
        AND public.is_ekskul_coach(j.extracurricular_type_id)
    )
  );

-- Storage foto
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
          OR public.is_ekskul_coach_for_path(name)
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
      OR public.is_ekskul_coach_for_path(name)
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
      OR public.is_ekskul_coach_for_path(name)
    )
  );

-- ---- 3) RPC baca data (tanpa syarat role pembina_ekskul) ----
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
      OR public.is_ekskul_coach(m.extracurricular_type_id)
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
      OR public.has_role(auth.uid(), 'kesiswaan')
      OR public.is_ekskul_coach(_type_id)
    )
  ORDER BY c.name NULLS LAST, s.full_name
$$;

-- Data penandatangan cetak: pembina (guru) boleh untuk ekskul binaannya
CREATE OR REPLACE FUNCTION public.get_ekskul_print_info(_type_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_wakasek_id uuid;
  v_wakasek jsonb;
  v_result jsonb;
BEGIN
  v_allowed :=
    public.is_super_admin()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'kesiswaan')
    OR public.is_ekskul_coach(_type_id);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Tidak memiliki akses ke data ekskul ini' USING ERRCODE = '42501';
  END IF;

  SELECT s.wakasek_kesiswaan_teacher_id
    INTO v_wakasek_id
  FROM public.school_settings s
  ORDER BY (s.school_id = public.get_user_school_id()) DESC NULLS LAST, s.created_at DESC
  LIMIT 1;

  IF v_wakasek_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'full_name', p.full_name,
             'nip', t.nip,
             'nuptk', t.nuptk,
             'pangkat_golongan', t.pangkat_golongan,
             'jabatan', t.jabatan
           )
      INTO v_wakasek
    FROM public.teachers t
    LEFT JOIN public.profiles p ON p.id = t.user_id
    WHERE t.id = v_wakasek_id;
  END IF;

  SELECT jsonb_build_object(
           'ekskul_name', et.name,
           'instructors', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id', i.id,
                        'name', i.name,
                        'nip', i.nip,
                        'nuptk', i.nuptk,
                        'pangkat_golongan', i.pangkat_golongan,
                        'jabatan', i.jabatan
                      ) ORDER BY i.name
                    )
             FROM public.extracurricular_instructors i
             WHERE i.extracurricular_type_id = et.id
               AND i.is_active
               AND (i.school_id = public.get_user_school_id() OR public.is_super_admin())
           ), '[]'::jsonb),
           'wakasek', v_wakasek
         )
    INTO v_result
  FROM public.extracurricular_types et
  WHERE et.id = _type_id;

  RETURN v_result;
END;
$$;

-- ---- 4) RPC penugasan oleh kesiswaan / admin ----------------

-- Daftar guru di sekolah ini (untuk dipilih)
CREATE OR REPLACE FUNCTION public.list_teachers_for_ekskul()
RETURNS TABLE (
  teacher_id uuid,
  user_id uuid,
  full_name text,
  nip text,
  nuptk text,
  pangkat_golongan text,
  jabatan text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.user_id, p.full_name, t.nip, t.nuptk, t.pangkat_golongan, t.jabatan
  FROM public.teachers t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE (t.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (
      public.has_role(auth.uid(), 'kesiswaan')
      OR public.has_role(auth.uid(), 'admin')
      OR public.is_super_admin()
    )
  ORDER BY p.full_name
$$;

-- Semua pembina per ekskul (guru berakun, maupun yang diketik manual)
CREATE OR REPLACE FUNCTION public.get_ekskul_assignments()
RETURNS TABLE (
  instructor_id uuid,
  coach_id uuid,
  extracurricular_type_id uuid,
  user_id uuid,
  full_name text,
  nip text,
  nuptk text,
  pangkat_golongan text,
  jabatan text,
  email text,
  has_account boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, c.id, i.extracurricular_type_id, c.user_id,
    i.name, i.nip, i.nuptk, i.pangkat_golongan, i.jabatan,
    p.email, (c.id IS NOT NULL)
  FROM public.extracurricular_instructors i
  LEFT JOIN public.extracurricular_coaches c ON c.instructor_id = i.id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE i.is_active
    AND (i.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (
      public.has_role(auth.uid(), 'kesiswaan')
      OR public.has_role(auth.uid(), 'admin')
      OR public.is_super_admin()
    )
  UNION ALL
  -- akun pembina lama (tanpa data instructor)
  SELECT
    NULL::uuid, c.id, c.extracurricular_type_id, c.user_id,
    p.full_name, NULL, NULL, NULL, NULL,
    p.email, true
  FROM public.extracurricular_coaches c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE c.instructor_id IS NULL
    AND (c.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (
      public.has_role(auth.uid(), 'kesiswaan')
      OR public.has_role(auth.uid(), 'admin')
      OR public.is_super_admin()
    )
  ORDER BY 5
$$;

-- Tugaskan pembina.
--   _teacher_id terisi -> data diambil dari tabel guru; bila guru punya akun,
--                         ia otomatis mendapat akses menu Jurnal & Anggota Ekskul
--   _teacher_id kosong -> data diketik manual (_name wajib); hanya tersimpan
--                         sebagai pembina (untuk cetak/tanda tangan), tanpa akses
CREATE OR REPLACE FUNCTION public.assign_ekskul_pembina(
  _type_id uuid,
  _teacher_id uuid DEFAULT NULL,
  _name text DEFAULT NULL,
  _nip text DEFAULT NULL,
  _nuptk text DEFAULT NULL,
  _pangkat_golongan text DEFAULT NULL,
  _jabatan text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
  v_name text;
  v_nip text;
  v_nuptk text;
  v_pangkat text;
  v_jabatan text;
  v_user uuid;
  v_instructor uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'kesiswaan')
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Tidak memiliki akses menugaskan pembina' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.extracurricular_types et
    WHERE et.id = _type_id
      AND (et.school_id IS NULL OR et.school_id = v_school OR public.is_super_admin())
  ) THEN
    RAISE EXCEPTION 'Ekskul tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;

  IF _teacher_id IS NOT NULL THEN
    SELECT p.full_name, t.nip, t.nuptk, t.pangkat_golongan, t.jabatan, t.user_id
      INTO v_name, v_nip, v_nuptk, v_pangkat, v_jabatan, v_user
    FROM public.teachers t
    LEFT JOIN public.profiles p ON p.id = t.user_id
    WHERE t.id = _teacher_id
      AND (t.school_id = v_school OR public.is_super_admin());
    IF NOT FOUND OR v_name IS NULL THEN
      RAISE EXCEPTION 'Guru tidak ditemukan' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_name := NULLIF(btrim(_name), '');
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Nama pembina wajib diisi' USING ERRCODE = '22023';
    END IF;
    v_nip := NULLIF(btrim(_nip), '');
    v_nuptk := NULLIF(btrim(_nuptk), '');
    v_pangkat := NULLIF(btrim(_pangkat_golongan), '');
    v_jabatan := NULLIF(btrim(_jabatan), '');
  END IF;

  -- Simpan/aktifkan data pembina (dipakai cetak jurnal & daftar hadir)
  SELECT i.id INTO v_instructor
  FROM public.extracurricular_instructors i
  WHERE i.extracurricular_type_id = _type_id
    AND lower(btrim(i.name)) = lower(v_name)
    AND (i.school_id = v_school OR i.school_id IS NULL)
  ORDER BY i.is_active DESC
  LIMIT 1;

  IF v_instructor IS NULL THEN
    INSERT INTO public.extracurricular_instructors
      (extracurricular_type_id, name, nip, nuptk, pangkat_golongan, jabatan, school_id)
    VALUES (_type_id, v_name, v_nip, v_nuptk, v_pangkat, v_jabatan, v_school)
    RETURNING id INTO v_instructor;
  ELSE
    UPDATE public.extracurricular_instructors
       SET is_active = true,
           nip = COALESCE(v_nip, nip),
           nuptk = COALESCE(v_nuptk, nuptk),
           pangkat_golongan = COALESCE(v_pangkat, pangkat_golongan),
           jabatan = COALESCE(v_jabatan, jabatan)
     WHERE id = v_instructor;
  END IF;

  -- Guru berakun -> beri akses
  IF v_user IS NOT NULL THEN
    INSERT INTO public.extracurricular_coaches (user_id, extracurricular_type_id, school_id, instructor_id)
    VALUES (v_user, _type_id, v_school, v_instructor)
    ON CONFLICT (user_id, extracurricular_type_id)
    DO UPDATE SET instructor_id = EXCLUDED.instructor_id;
  END IF;

  RETURN jsonb_build_object('instructor_id', v_instructor, 'has_account', v_user IS NOT NULL);
END;
$$;

-- Cabut penugasan: hapus akses & nonaktifkan data pembina (riwayat honor tetap aman)
CREATE OR REPLACE FUNCTION public.unassign_ekskul_pembina(
  _instructor_id uuid DEFAULT NULL,
  _coach_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := public.get_user_school_id();
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'kesiswaan')
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Tidak memiliki akses mencabut penugasan' USING ERRCODE = '42501';
  END IF;

  IF _coach_id IS NOT NULL THEN
    DELETE FROM public.extracurricular_coaches
    WHERE id = _coach_id AND (school_id = v_school OR public.is_super_admin());
  END IF;

  IF _instructor_id IS NOT NULL THEN
    DELETE FROM public.extracurricular_coaches
    WHERE instructor_id = _instructor_id AND (school_id = v_school OR public.is_super_admin());
    UPDATE public.extracurricular_instructors
       SET is_active = false
     WHERE id = _instructor_id AND (school_id = v_school OR public.is_super_admin());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_teachers_for_ekskul() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ekskul_assignments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_ekskul_pembina(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unassign_ekskul_pembina(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_teachers_for_ekskul() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ekskul_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_ekskul_pembina(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_ekskul_pembina(uuid, uuid) TO authenticated;
