-- =====================================================================
-- E-Learning -> Nilai: guru memetakan materi/tugas e-learning ke JENIS PENILAIAN
-- (Tugas/Kuis/UTS/UAS/Praktik atau jenis buatan guru). Nilai yang diberikan pada
-- jawaban siswa otomatis mengalir ke jenis penilaian itu di menu Nilai.
--
-- Aturan:
--   * Pemetaan disimpan per materi (kolom grade_legacy_key ATAU grade_component_name).
--     Pemetaan memakai kunci/nama, bukan id komponen, supaya tetap jalan walau
--     "Atur Jenis & Bobot" disimpan ulang atau diterapkan ke kelas paralel.
--   * Beberapa materi boleh dipetakan ke jenis yang sama: nilai siswa = RATA-RATA
--     nilai materi yang sudah dinilai (materi yang belum dinilai tidak dihitung 0).
--   * Jadwal tujuan dicari dari kelas + mapel + tahun ajaran & semester aktif
--     (mengutamakan jadwal yang sudah punya baris nilai, lalu jadwal guru pemilik materi).
--   * Nilai yang dialirkan menimpa isian manual pada jenis tersebut (sama seperti nilai CBT).
--   * Menghapus nilai/jawaban/materi TIDAK mengosongkan nilai di menu Nilai
--     (tidak ada data yang hilang otomatis); nilai dihitung ulang bila masih ada materi lain.
--   * Bila kelas/mapel tidak punya jadwal, atau jenis penilaian tujuan tidak ada
--     (mis. dihapus lewat "Atur Jenis & Bobot"), nilai tidak ditulis dan tombol
--     "Sinkronkan" melaporkannya.
--
-- Jalankan SETELAH 20261030090000_grade_components_bobot.sql (dan
-- 20261008060000_elearning_submissions.sql). Aman dijalankan ulang.
-- =====================================================================

-- 1. Kolom pemetaan pada materi ----------------------------------------
ALTER TABLE public.elearning_materials
  ADD COLUMN IF NOT EXISTS grade_legacy_key text,
  ADD COLUMN IF NOT EXISTS grade_component_name text;

ALTER TABLE public.elearning_materials DROP CONSTRAINT IF EXISTS elearning_grade_target_check;
ALTER TABLE public.elearning_materials ADD CONSTRAINT elearning_grade_target_check CHECK (
  (grade_legacy_key IS NULL OR grade_legacy_key IN ('tugas', 'kuis', 'uts', 'uas', 'praktik'))
  AND (grade_component_name IS NULL OR char_length(btrim(grade_component_name)) BETWEEN 1 AND 40)
  AND NOT (grade_legacy_key IS NOT NULL AND grade_component_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_elearning_grade_target
  ON public.elearning_materials (class_id, teacher_id)
  WHERE grade_legacy_key IS NOT NULL OR grade_component_name IS NOT NULL;

-- 2. Cari jadwal tujuan --------------------------------------------------
CREATE OR REPLACE FUNCTION public._elearning_resolve_schedule(
  p_class uuid, p_subject text, p_teacher uuid, p_student uuid, p_school uuid
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text;
  v_sem integer;
  v_sched uuid;
BEGIN
  SELECT ss.academic_year, ss.active_semester INTO v_year, v_sem
    FROM public.school_settings ss
   ORDER BY (ss.school_id IS NOT DISTINCT FROM p_school) DESC NULLS LAST, ss.created_at DESC
   LIMIT 1;

  SELECT sc.id INTO v_sched
    FROM public.schedules sc
   WHERE sc.class_id = p_class AND sc.is_active
     AND lower(btrim(sc.subject)) = lower(btrim(p_subject))
     AND (v_year IS NULL OR sc.academic_year = v_year)
     AND (v_sem IS NULL OR sc.semester IS NULL OR sc.semester::text = v_sem::text)
   ORDER BY (EXISTS (SELECT 1 FROM public.grades g WHERE g.student_id = p_student AND g.schedule_id = sc.id)) DESC,
            (sc.teacher_id::text = p_teacher::text) DESC, sc.id
   LIMIT 1;
  RETURN v_sched;
END;
$$;
REVOKE ALL ON FUNCTION public._elearning_resolve_schedule(uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3. Hitung nilai satu siswa untuk satu jenis penilaian & tulis ke menu Nilai ----
-- Hasil: ok | skip | no_schedule | no_component
CREATE OR REPLACE FUNCTION public._elearning_sync_target(
  p_class uuid, p_subject text, p_teacher uuid, p_student uuid,
  p_legacy text, p_name text, p_school uuid, p_by uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric;
  v_sched uuid;
  v_sched_school uuid;
  v_n integer;
  v_comp uuid;
BEGIN
  IF p_legacy IS NULL AND nullif(btrim(coalesce(p_name, '')), '') IS NULL THEN RETURN 'skip'; END IF;

  SELECT avg(s.score) INTO v_score
    FROM public.elearning_materials m
    JOIN public.elearning_submissions s ON s.material_id = m.id AND s.student_id = p_student
   WHERE m.class_id = p_class
     AND lower(btrim(m.subject)) = lower(btrim(p_subject))
     AND m.teacher_id = p_teacher
     AND s.score IS NOT NULL
     AND (
       (p_legacy IS NOT NULL AND m.grade_legacy_key = p_legacy)
       OR (p_legacy IS NULL AND m.grade_legacy_key IS NULL
           AND lower(btrim(m.grade_component_name)) = lower(btrim(p_name)))
     );
  IF v_score IS NULL THEN RETURN 'skip'; END IF;
  v_score := least(100, greatest(0, round(v_score, 2)));

  v_sched := public._elearning_resolve_schedule(p_class, p_subject, p_teacher, p_student, p_school);
  IF v_sched IS NULL THEN RETURN 'no_schedule'; END IF;
  SELECT school_id INTO v_sched_school FROM public.schedules WHERE id = v_sched;

  SELECT count(*) INTO v_n FROM public.grade_components WHERE schedule_id = v_sched;

  IF p_legacy IS NOT NULL THEN
    -- jenis bawaan sekolah (tanpa komponen) selalu menerima; bila guru sudah punya komponen,
    -- harus ada komponen dengan kunci tsb agar nilainya ikut dihitung
    IF v_n > 0 AND NOT EXISTS (
         SELECT 1 FROM public.grade_components c WHERE c.schedule_id = v_sched AND c.legacy_key = p_legacy
       ) THEN
      RETURN 'no_component';
    END IF;
    EXECUTE format(
      'INSERT INTO public.grades (student_id, schedule_id, %1$I, created_by, school_id) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id, schedule_id) DO UPDATE SET %1$I = EXCLUDED.%1$I, updated_at = now()',
      p_legacy)
    USING p_student, v_sched, v_score, p_by, v_sched_school;
    RETURN 'ok';
  END IF;

  SELECT c.id INTO v_comp
    FROM public.grade_components c
   WHERE c.schedule_id = v_sched AND c.legacy_key IS NULL
     AND lower(btrim(c.name)) = lower(btrim(p_name));
  IF v_comp IS NULL THEN RETURN 'no_component'; END IF;

  INSERT INTO public.grade_scores (student_id, schedule_id, component_id, score, school_id, created_by)
  VALUES (p_student, v_sched, v_comp, v_score, v_sched_school, p_by)
  ON CONFLICT (student_id, component_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now();
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public._elearning_sync_target(uuid, text, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 4. Sinkron satu siswa untuk target yang dipakai suatu materi ------------------
CREATE OR REPLACE FUNCTION public._elearning_sync_one(p_material uuid, p_student uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.elearning_materials;
BEGIN
  SELECT * INTO m FROM public.elearning_materials WHERE id = p_material;
  IF NOT FOUND THEN RETURN 'skip'; END IF;
  RETURN public._elearning_sync_target(
    m.class_id, m.subject, m.teacher_id, p_student,
    m.grade_legacy_key, m.grade_component_name, m.school_id, m.created_by);
END;
$$;
REVOKE ALL ON FUNCTION public._elearning_sync_one(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 5. Pemicu: nilai jawaban siswa berubah ----------------------------------------
CREATE OR REPLACE FUNCTION public._elearning_sub_sync_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public._elearning_sync_one(OLD.material_id, OLD.student_id);
    RETURN OLD;
  END IF;
  PERFORM public._elearning_sync_one(NEW.material_id, NEW.student_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'elearning grade sync: %', SQLERRM;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public._elearning_sub_sync_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_elearning_sub_sync_ins ON public.elearning_submissions;
CREATE TRIGGER trg_elearning_sub_sync_ins
  AFTER INSERT ON public.elearning_submissions
  FOR EACH ROW WHEN (NEW.score IS NOT NULL)
  EXECUTE FUNCTION public._elearning_sub_sync_trigger();

DROP TRIGGER IF EXISTS trg_elearning_sub_sync_upd ON public.elearning_submissions;
CREATE TRIGGER trg_elearning_sub_sync_upd
  AFTER UPDATE OF score ON public.elearning_submissions
  FOR EACH ROW WHEN (NEW.score IS DISTINCT FROM OLD.score)
  EXECUTE FUNCTION public._elearning_sub_sync_trigger();

DROP TRIGGER IF EXISTS trg_elearning_sub_sync_del ON public.elearning_submissions;
CREATE TRIGGER trg_elearning_sub_sync_del
  AFTER DELETE ON public.elearning_submissions
  FOR EACH ROW WHEN (OLD.score IS NOT NULL)
  EXECUTE FUNCTION public._elearning_sub_sync_trigger();

-- 6. Pemicu: guru mengubah pemetaan materi -------------------------------------
-- Target lama dihitung ulang tanpa materi ini; target baru langsung menerima nilai yang sudah ada.
CREATE OR REPLACE FUNCTION public._elearning_material_target_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT student_id FROM public.elearning_submissions
            WHERE material_id = NEW.id AND score IS NOT NULL LOOP
    IF OLD.grade_legacy_key IS NOT NULL OR OLD.grade_component_name IS NOT NULL THEN
      PERFORM public._elearning_sync_target(
        OLD.class_id, OLD.subject, OLD.teacher_id, r.student_id,
        OLD.grade_legacy_key, OLD.grade_component_name, OLD.school_id, OLD.created_by);
    END IF;
    IF NEW.grade_legacy_key IS NOT NULL OR NEW.grade_component_name IS NOT NULL THEN
      PERFORM public._elearning_sync_target(
        NEW.class_id, NEW.subject, NEW.teacher_id, r.student_id,
        NEW.grade_legacy_key, NEW.grade_component_name, NEW.school_id, NEW.created_by);
    END IF;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'elearning grade remap: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._elearning_material_target_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_elearning_material_target ON public.elearning_materials;
CREATE TRIGGER trg_elearning_material_target
  AFTER UPDATE OF grade_legacy_key, grade_component_name, class_id, subject ON public.elearning_materials
  FOR EACH ROW WHEN (
    (OLD.class_id, OLD.subject, OLD.grade_legacy_key, OLD.grade_component_name)
      IS DISTINCT FROM (NEW.class_id, NEW.subject, NEW.grade_legacy_key, NEW.grade_component_name)
  )
  EXECUTE FUNCTION public._elearning_material_target_trigger();

-- 7. Tombol guru: sinkronkan ulang semua nilai satu materi ----------------------
CREATE OR REPLACE FUNCTION public.elearning_sync_grades(p_material uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.elearning_materials;
  r record;
  v_res text;
  v_out jsonb := jsonb_build_object('ok', 0, 'skip', 0, 'no_schedule', 0, 'no_component', 0);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus login'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin() OR public.is_my_material(p_material)) THEN
    RAISE EXCEPTION 'Anda tidak berhak menyinkronkan nilai materi ini';
  END IF;
  SELECT * INTO m FROM public.elearning_materials WHERE id = p_material;
  IF NOT FOUND THEN RAISE EXCEPTION 'Materi tidak ditemukan'; END IF;
  IF m.grade_legacy_key IS NULL AND m.grade_component_name IS NULL THEN
    RAISE EXCEPTION 'Materi ini belum dipetakan ke jenis penilaian';
  END IF;

  FOR r IN SELECT DISTINCT student_id FROM public.elearning_submissions
            WHERE material_id = p_material AND score IS NOT NULL LOOP
    v_res := public._elearning_sync_one(p_material, r.student_id);
    v_out := jsonb_set(v_out, ARRAY[v_res], to_jsonb(coalesce((v_out ->> v_res)::int, 0) + 1));
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.elearning_sync_grades(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elearning_sync_grades(uuid) TO authenticated;

-- 8. Daftar jenis penilaian yang bisa dipilih untuk kelas + mapel ---------------
-- {"schedule_found":bool,"custom":bool,"items":[{"key":"legacy:tugas|name:Portofolio","label":"Tugas","weight":20,"category":"pengetahuan"}]}
CREATE OR REPLACE FUNCTION public.elearning_grade_targets(p_class uuid, p_subject text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher uuid;
  v_school uuid;
  v_sched uuid;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus login'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()
          OR public.teaches_class_subject(p_class, p_subject)) THEN
    RAISE EXCEPTION 'Anda tidak mengajar kelas dan mapel ini';
  END IF;
  SELECT t.id INTO v_teacher FROM public.teachers t WHERE t.user_id = auth.uid() LIMIT 1;
  SELECT c.school_id INTO v_school FROM public.classes c WHERE c.id = p_class;

  v_sched := public._elearning_resolve_schedule(p_class, p_subject, v_teacher, NULL, v_school);
  IF v_sched IS NULL THEN
    RETURN jsonb_build_object('schedule_found', false, 'custom', false, 'items', '[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'key', CASE WHEN c.legacy_key IS NOT NULL THEN 'legacy:' || c.legacy_key ELSE 'name:' || c.name END,
           'label', c.name, 'weight', c.weight, 'category', c.category
         ) ORDER BY c.sort_order, c.name), '[]'::jsonb)
    INTO v_items
    FROM public.grade_components c WHERE c.schedule_id = v_sched;

  IF jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('schedule_found', true, 'custom', false, 'items', jsonb_build_array(
      jsonb_build_object('key', 'legacy:tugas',   'label', 'Tugas',   'weight', 20, 'category', 'pengetahuan'),
      jsonb_build_object('key', 'legacy:kuis',    'label', 'Kuis',    'weight', 20, 'category', 'pengetahuan'),
      jsonb_build_object('key', 'legacy:uts',     'label', 'UTS',     'weight', 25, 'category', 'pengetahuan'),
      jsonb_build_object('key', 'legacy:uas',     'label', 'UAS',     'weight', 25, 'category', 'pengetahuan'),
      jsonb_build_object('key', 'legacy:praktik', 'label', 'Praktik', 'weight', 10, 'category', 'pengetahuan')));
  END IF;
  RETURN jsonb_build_object('schedule_found', true, 'custom', true, 'items', v_items);
END;
$$;
REVOKE ALL ON FUNCTION public.elearning_grade_targets(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elearning_grade_targets(uuid, text) TO authenticated;
