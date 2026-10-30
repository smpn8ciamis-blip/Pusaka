-- ============================================================
-- Nilai: kategori jenis penilaian (Pengetahuan / Keterampilan / Sikap)
--
-- Tiap jenis penilaian boleh diberi kategori. Aplikasi menampilkan rata-rata
-- berbobot per kategori secara terpisah; nilai akhir (final_grade) tetap satu
-- angka dari semua jenis, jadi dasbor dan analitik lama tidak berubah.
-- Data lama otomatis berkategori 'pengetahuan'.
--
-- Jalankan SETELAH 20261030090000_grade_components_bobot.sql. Aman dijalankan ulang.
-- ============================================================

ALTER TABLE public.grade_components
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'pengetahuan';
ALTER TABLE public.grade_components DROP CONSTRAINT IF EXISTS grade_components_category_check;
ALTER TABLE public.grade_components ADD CONSTRAINT grade_components_category_check
  CHECK (category IN ('pengetahuan', 'keterampilan', 'sikap'));

-- Fungsi simpan diperbarui: menerima "category" pada tiap item p_items
-- [{"id":"uuid?","name":"Tugas","weight":20,"legacy_key":"tugas|null","category":"pengetahuan"}, ...]
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
         SET name = v_name, weight = (v_item ->> 'weight')::numeric, legacy_key = v_key, sort_order = i,
             category = coalesce(nullif(v_item ->> 'category', ''), 'pengetahuan')
       WHERE id = v_ids[i + 1];
    ELSE
      INSERT INTO public.grade_components (schedule_id, name, weight, legacy_key, sort_order, school_id, created_by, category)
      VALUES (p_schedule, v_name, (v_item ->> 'weight')::numeric, v_key, i, v_school, auth.uid(),
              coalesce(nullif(v_item ->> 'category', ''), 'pengetahuan'));
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
    IF coalesce(nullif(v_item ->> 'category', ''), 'pengetahuan') NOT IN ('pengetahuan','keterampilan','sikap') THEN
      RAISE EXCEPTION 'Kategori "%" tidak dikenal', v_item ->> 'category';
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
