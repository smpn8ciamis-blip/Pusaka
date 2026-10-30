-- ============================================================
-- Nilai: jenis penilaian & bobot yang bisa diatur guru per mata pelajaran (jadwal)
--
-- Sebelumnya nilai akhir memakai rumus tetap di kolom hasil hitung (generated):
--   tugas 20% + kuis 20% + UTS 25% + UAS 25% + praktik 10%
-- Sekarang guru boleh membuat jenis penilaian sendiri (mis. "Portofolio",
-- "Proyek", "PH 1") dan menentukan bobot tiap jenis.
--
-- Kompatibilitas:
--  * Jadwal yang belum diatur guru tetap memakai rumus lama (20/20/25/25/10).
--  * Komponen bawaan (tugas/kuis/uts/uas/praktik) tetap disimpan di kolom lama
--    pada tabel grades, jadi nilai CBT, dashboard siswa, analitik, dan PDF lama
--    tetap berjalan. Komponen buatan guru disimpan di grade_scores.
--  * grades.final_grade berubah dari kolom generated menjadi kolom biasa yang
--    dihitung otomatis oleh trigger (nilai lama dipertahankan apa adanya).
--
-- Jalankan SETELAH 20261023150000_cbt_scale_grades.sql. Aman dijalankan ulang.
-- ============================================================

-- 1) Tabel komponen -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grade_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  weight numeric(5,2) NOT NULL CHECK (weight >= 0 AND weight <= 100),
  -- bila diisi, komponen memakai kolom lama di grades (tempat nilai CBT masuk)
  legacy_key text CHECK (legacy_key IS NULL OR legacy_key IN ('tugas','kuis','uts','uas','praktik')),
  sort_order integer NOT NULL DEFAULT 0,
  school_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, schedule_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_grade_components_legacy
  ON public.grade_components (schedule_id, legacy_key) WHERE legacy_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_grade_components_name
  ON public.grade_components (schedule_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_grade_components_schedule ON public.grade_components (schedule_id);
CREATE INDEX IF NOT EXISTS idx_grade_components_school_id ON public.grade_components (school_id);

-- 2) Tabel nilai komponen buatan guru -------------------------------------
CREATE TABLE IF NOT EXISTS public.grade_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  component_id uuid NOT NULL,
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  school_id uuid,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, component_id),
  FOREIGN KEY (component_id, schedule_id)
    REFERENCES public.grade_components (id, schedule_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_grade_scores_schedule_student ON public.grade_scores (schedule_id, student_id);
CREATE INDEX IF NOT EXISTS idx_grade_scores_school_id ON public.grade_scores (school_id);

ALTER TABLE public.grade_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_scores ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.grade_components TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grade_scores TO authenticated;
GRANT ALL ON public.grade_components, public.grade_scores TO service_role;

DROP TRIGGER IF EXISTS auto_set_school_id_grade_components ON public.grade_components;
CREATE TRIGGER auto_set_school_id_grade_components
  BEFORE INSERT ON public.grade_components
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
DROP TRIGGER IF EXISTS auto_set_school_id_grade_scores ON public.grade_scores;
CREATE TRIGGER auto_set_school_id_grade_scores
  BEFORE INSERT ON public.grade_scores
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();
DROP TRIGGER IF EXISTS update_grade_components_updated_at ON public.grade_components;
CREATE TRIGGER update_grade_components_updated_at
  BEFORE UPDATE ON public.grade_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_grade_scores_updated_at ON public.grade_scores;
CREATE TRIGGER update_grade_scores_updated_at
  BEFORE UPDATE ON public.grade_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Helper hak akses -------------------------------------------------------
-- Boleh mengatur/mengisi nilai suatu jadwal: admin, super admin, atau guru pemilik jadwal.
CREATE OR REPLACE FUNCTION public._grade_can_manage(p_schedule uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_schedule IS NOT NULL AND auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.schedules s
      JOIN public.teachers t ON t.id = s.teacher_id
      WHERE s.id = p_schedule AND t.user_id = auth.uid()
    )
  );
$$;
REVOKE ALL ON FUNCTION public._grade_can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._grade_can_manage(uuid) TO authenticated;

-- 4) RLS --------------------------------------------------------------------
-- Komponen: terlihat oleh siapa pun yang boleh melihat nilai pada jadwal itu
-- (subquery ke grades ikut kena RLS grades, termasuk aturan nilai disembunyikan dari siswa).
-- Perubahan komponen hanya lewat fungsi grade_save_components (tanpa policy tulis).
DROP POLICY IF EXISTS "grade_components_select" ON public.grade_components;
CREATE POLICY "grade_components_select" ON public.grade_components
  FOR SELECT TO authenticated
  USING (
    public._grade_can_manage(schedule_id)
    OR EXISTS (SELECT 1 FROM public.grades g WHERE g.schedule_id = grade_components.schedule_id)
  );

DROP POLICY IF EXISTS "grade_scores_select" ON public.grade_scores;
CREATE POLICY "grade_scores_select" ON public.grade_scores
  FOR SELECT TO authenticated
  USING (
    public._grade_can_manage(schedule_id)
    OR EXISTS (
      SELECT 1 FROM public.grades g
      WHERE g.student_id = grade_scores.student_id AND g.schedule_id = grade_scores.schedule_id
    )
  );

DROP POLICY IF EXISTS "grade_scores_insert" ON public.grade_scores;
CREATE POLICY "grade_scores_insert" ON public.grade_scores
  FOR INSERT TO authenticated
  WITH CHECK (public._grade_can_manage(schedule_id));
DROP POLICY IF EXISTS "grade_scores_update" ON public.grade_scores;
CREATE POLICY "grade_scores_update" ON public.grade_scores
  FOR UPDATE TO authenticated
  USING (public._grade_can_manage(schedule_id))
  WITH CHECK (public._grade_can_manage(schedule_id));
DROP POLICY IF EXISTS "grade_scores_delete" ON public.grade_scores;
CREATE POLICY "grade_scores_delete" ON public.grade_scores
  FOR DELETE TO authenticated
  USING (public._grade_can_manage(schedule_id));

DROP POLICY IF EXISTS "school_isolation_grade_components" ON public.grade_components;
CREATE POLICY "school_isolation_grade_components" ON public.grade_components
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());
DROP POLICY IF EXISTS "school_isolation_grade_scores" ON public.grade_scores;
CREATE POLICY "school_isolation_grade_scores" ON public.grade_scores
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

-- 5) Rumus nilai akhir -------------------------------------------------------
-- Tanpa komponen buatan guru  -> rumus lama (20/20/25/25/10).
-- Dengan komponen             -> rata-rata berbobot: sum(bobot*nilai) / sum(bobot).
-- Nilai yang belum diisi dihitung 0 (sama seperti perilaku sebelumnya).
CREATE OR REPLACE FUNCTION public._grade_final(
  p_student uuid, p_schedule uuid,
  p_tugas numeric, p_kuis numeric, p_uts numeric, p_uas numeric, p_praktik numeric
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_sum numeric;
BEGIN
  SELECT sum(c.weight),
         sum(c.weight * coalesce(
           CASE c.legacy_key
             WHEN 'tugas' THEN p_tugas WHEN 'kuis' THEN p_kuis WHEN 'uts' THEN p_uts
             WHEN 'uas' THEN p_uas WHEN 'praktik' THEN p_praktik
             ELSE gs.score
           END, 0))
    INTO v_total, v_sum
  FROM public.grade_components c
  LEFT JOIN public.grade_scores gs ON gs.component_id = c.id AND gs.student_id = p_student
  WHERE c.schedule_id = p_schedule;

  IF v_total IS NULL THEN
    RETURN round(coalesce(p_tugas,0) * 0.2 + coalesce(p_kuis,0) * 0.2 + coalesce(p_uts,0) * 0.25
               + coalesce(p_uas,0) * 0.25 + coalesce(p_praktik,0) * 0.1, 2);
  END IF;
  IF v_total <= 0 THEN RETURN 0; END IF;
  RETURN round(least(100, greatest(0, v_sum / v_total)), 2);
END;
$$;
REVOKE ALL ON FUNCTION public._grade_final(uuid, uuid, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;

-- 6) final_grade: dari generated menjadi kolom biasa (nilai lama tetap) --------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.grades'::regclass AND attname = 'final_grade'
      AND attgenerated <> ''
  ) THEN
    ALTER TABLE public.grades ALTER COLUMN final_grade DROP EXPRESSION;
  END IF;
END $$;
ALTER TABLE public.grades ALTER COLUMN final_grade SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public._grades_set_final()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.final_grade := public._grade_final(
    NEW.student_id, NEW.schedule_id, NEW.tugas, NEW.kuis, NEW.uts, NEW.uas, NEW.praktik);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_grades_set_final ON public.grades;
CREATE TRIGGER trg_grades_set_final
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public._grades_set_final();

-- 7) Hitung ulang saat komponen / nilai komponen berubah ---------------------
CREATE OR REPLACE FUNCTION public._grade_recompute_schedule(p_schedule uuid, p_student uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- jadwal sedang dihapus (cascade): tidak perlu menghitung
  IF NOT EXISTS (SELECT 1 FROM public.schedules WHERE id = p_schedule) THEN RETURN; END IF;
  UPDATE public.grades SET final_grade = final_grade
   WHERE schedule_id = p_schedule AND (p_student IS NULL OR student_id = p_student);
END;
$$;
REVOKE ALL ON FUNCTION public._grade_recompute_schedule(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._grade_components_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('pusaka.skip_grade_recompute', true) = 'on' THEN RETURN NULL; END IF;
  PERFORM public._grade_recompute_schedule(COALESCE(NEW.schedule_id, OLD.schedule_id));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_grade_components_after ON public.grade_components;
CREATE TRIGGER trg_grade_components_after
  AFTER INSERT OR UPDATE OR DELETE ON public.grade_components
  FOR EACH ROW EXECUTE FUNCTION public._grade_components_after();

CREATE OR REPLACE FUNCTION public._grade_scores_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('pusaka.skip_grade_recompute', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public._grade_recompute_schedule(OLD.schedule_id, OLD.student_id);
    RETURN NULL;
  END IF;
  -- pastikan baris grades ada (siswa mungkin baru punya nilai komponen buatan guru)
  INSERT INTO public.grades (student_id, schedule_id, created_by, school_id)
  VALUES (NEW.student_id, NEW.schedule_id, COALESCE(NEW.created_by, auth.uid()), NEW.school_id)
  ON CONFLICT (student_id, schedule_id) DO UPDATE SET final_grade = public.grades.final_grade;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_grade_scores_after ON public.grade_scores;
CREATE TRIGGER trg_grade_scores_after
  AFTER INSERT OR UPDATE OR DELETE ON public.grade_scores
  FOR EACH ROW EXECUTE FUNCTION public._grade_scores_after();

-- 8) Simpan jenis penilaian & bobot (satu panggilan, atomik) -------------------
-- p_items: [{"id":"uuid?","name":"Tugas","weight":20,"legacy_key":"tugas|null"}, ...]
-- p_items kosong ([]) = kembali ke bawaan (rumus lama).
-- p_apply_parallel = true: terapkan juga ke kelas paralel (mapel & semester sama,
-- guru yang sama). Komponen dicocokkan lewat legacy_key lalu nama.
CREATE OR REPLACE FUNCTION public._grade_apply_components(p_schedule uuid, p_items jsonb, p_use_ids boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int := jsonb_array_length(p_items);
  v_ids uuid[] := ARRAY[]::uuid[];   -- sejajar dengan p_items; NULL = komponen baru
  v_used uuid[] := ARRAY[]::uuid[];  -- hanya id yang sudah terpakai (tanpa NULL)
  v_id uuid;
  v_item jsonb;
  v_key text;
  v_name text;
  v_school uuid;
  i int;
BEGIN
  SELECT school_id INTO v_school FROM public.schedules WHERE id = p_schedule;

  -- cocokkan item dengan komponen yang sudah ada
  FOR i IN 0 .. v_n - 1 LOOP
    v_item := p_items -> i;
    v_key := nullif(v_item ->> 'legacy_key', '');
    v_name := btrim(v_item ->> 'name');
    v_id := NULL;
    IF p_use_ids AND nullif(v_item ->> 'id', '') IS NOT NULL THEN
      SELECT c.id INTO v_id FROM public.grade_components c
       WHERE c.schedule_id = p_schedule AND c.id = (v_item ->> 'id')::uuid
         AND NOT (c.id = ANY (v_used));
    END IF;
    IF v_id IS NULL AND v_key IS NOT NULL THEN
      SELECT c.id INTO v_id FROM public.grade_components c
       WHERE c.schedule_id = p_schedule AND c.legacy_key = v_key AND NOT (c.id = ANY (v_used));
    END IF;
    IF v_id IS NULL THEN
      SELECT c.id INTO v_id FROM public.grade_components c
       WHERE c.schedule_id = p_schedule AND lower(btrim(c.name)) = lower(v_name)
         AND NOT (c.id = ANY (v_used));
    END IF;
    v_ids := v_ids || v_id;
    IF v_id IS NOT NULL THEN v_used := v_used || v_id; END IF;
  END LOOP;

  DELETE FROM public.grade_components c
   WHERE c.schedule_id = p_schedule AND NOT (c.id = ANY (v_used));

  -- lepas nama/legacy_key sementara agar tukar-posisi tidak bentrok dengan indeks unik
  UPDATE public.grade_components SET legacy_key = NULL, name = id::text WHERE schedule_id = p_schedule;

  FOR i IN 0 .. v_n - 1 LOOP
    v_item := p_items -> i;
    v_key := nullif(v_item ->> 'legacy_key', '');
    v_name := btrim(v_item ->> 'name');
    IF v_ids[i + 1] IS NOT NULL THEN
      UPDATE public.grade_components
         SET name = v_name, weight = (v_item ->> 'weight')::numeric, legacy_key = v_key, sort_order = i
       WHERE id = v_ids[i + 1];
    ELSE
      INSERT INTO public.grade_components (schedule_id, name, weight, legacy_key, sort_order, school_id, created_by)
      VALUES (p_schedule, v_name, (v_item ->> 'weight')::numeric, v_key, i, v_school, auth.uid());
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._grade_apply_components(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.grade_save_components(
  p_schedule uuid, p_items jsonb, p_apply_parallel boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
  v_item jsonb;
  v_total numeric := 0;
  v_keys text[] := ARRAY[]::text[];
  v_names text[] := ARRAY[]::text[];
  v_key text;
  v_name text;
  v_w numeric;
  s public.schedules;
  t uuid;
  v_targets uuid[];
  i int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus login'; END IF;
  IF NOT public._grade_can_manage(p_schedule) THEN
    RAISE EXCEPTION 'Anda tidak berhak mengatur penilaian mata pelajaran ini';
  END IF;
  SELECT * INTO s FROM public.schedules WHERE id = p_schedule;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jadwal tidak ditemukan'; END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Format daftar penilaian tidak valid';
  END IF;
  v_n := jsonb_array_length(p_items);
  IF v_n > 12 THEN RAISE EXCEPTION 'Maksimal 12 jenis penilaian'; END IF;

  FOR i IN 0 .. v_n - 1 LOOP
    v_item := p_items -> i;
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    IF char_length(v_name) < 1 OR char_length(v_name) > 40 THEN
      RAISE EXCEPTION 'Nama jenis penilaian harus 1-40 karakter';
    END IF;
    IF lower(v_name) = ANY (v_names) THEN
      RAISE EXCEPTION 'Nama jenis penilaian ganda: %', v_name;
    END IF;
    v_names := v_names || lower(v_name);
    BEGIN
      v_w := (v_item ->> 'weight')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Bobot "%" bukan angka', v_name;
    END;
    IF v_w IS NULL OR v_w < 0 OR v_w > 100 THEN
      RAISE EXCEPTION 'Bobot "%" harus 0-100', v_name;
    END IF;
    v_key := nullif(v_item ->> 'legacy_key', '');
    IF v_key IS NOT NULL THEN
      IF v_key NOT IN ('tugas','kuis','uts','uas','praktik') THEN
        RAISE EXCEPTION 'Kunci komponen tidak dikenal: %', v_key;
      END IF;
      IF v_key = ANY (v_keys) THEN
        RAISE EXCEPTION 'Penerima nilai CBT "%" dipakai lebih dari satu jenis penilaian', v_key;
      END IF;
      v_keys := v_keys || v_key;
    END IF;
    v_total := v_total + v_w;
  END LOOP;
  IF v_n > 0 AND abs(v_total - 100) > 0.005 THEN
    RAISE EXCEPTION 'Total bobot harus tepat 100 (sekarang %)', v_total;
  END IF;

  v_targets := ARRAY[p_schedule];
  IF p_apply_parallel THEN
    v_targets := v_targets || coalesce((
      SELECT array_agg(o.id) FROM public.schedules o
       WHERE o.id <> s.id AND o.teacher_id IS NOT DISTINCT FROM s.teacher_id
         AND o.academic_year IS NOT DISTINCT FROM s.academic_year
         AND o.semester IS NOT DISTINCT FROM s.semester
         AND lower(btrim(o.subject)) = lower(btrim(s.subject))
    ), ARRAY[]::uuid[]);
  END IF;

  PERFORM set_config('pusaka.skip_grade_recompute', 'on', true);
  FOREACH t IN ARRAY v_targets LOOP
    PERFORM public._grade_apply_components(t, p_items, t = p_schedule);
  END LOOP;
  PERFORM set_config('pusaka.skip_grade_recompute', 'off', true);
  FOREACH t IN ARRAY v_targets LOOP
    PERFORM public._grade_recompute_schedule(t);
  END LOOP;

  RETURN jsonb_build_object('schedules', array_length(v_targets, 1), 'components', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.grade_save_components(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_save_components(uuid, jsonb, boolean) TO authenticated;
