-- Kunci data perjalanan dinas yang sudah berstatus SPJ.
--
-- Aturan:
--  * Kwitansi (payment_receipts) yang is_spj = true tidak bisa diubah/dihapus (termasuk menghapus ceklis SPJ).
--  * SPD (official_travel_letters + pelaksana/pengikutnya) yang punya minimal satu kwitansi ber-SPJ terkunci.
--  * Surat tugas (assignment_letters + pelaksananya) yang dipakai SPD terkunci tadi ikut terkunci.
--  * Pembuka kunci: kode hapus yang ditetapkan admin (RPC set_spj_unlock_code). Kode yang benar memberi izin
--    10 menit kepada akun yang memasukkannya, hanya untuk set data itu (kwitansi/SPD/surat tugas terkait).
--  * Penegakan di database (trigger), bukan hanya di tampilan, sehingga tidak bisa dilewati lewat API.
--  * Koneksi tanpa auth.uid() (service role / SQL Editor / migrasi) tidak dikunci: itu jalur administrator server.
--  * Selama admin belum menetapkan kode, data terkunci tidak bisa dibuka lewat aplikasi.
-- Aman dijalankan ulang.

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spj_lock_settings (
  school_key uuid PRIMARY KEY,
  code_salt text NOT NULL,
  code_hash text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.spj_unlock_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_key uuid NOT NULL,
  user_id uuid NOT NULL,
  travel_id uuid,
  assignment_letter_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spj_grants_user_travel ON public.spj_unlock_grants (user_id, travel_id) WHERE travel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spj_grants_user_letter ON public.spj_unlock_grants (user_id, assignment_letter_id) WHERE assignment_letter_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.spj_unlock_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_key uuid NOT NULL,
  user_id uuid NOT NULL,
  target_kind text NOT NULL,
  target_id uuid,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spj_attempts_user_time ON public.spj_unlock_attempts (user_id, created_at DESC);

ALTER TABLE public.spj_lock_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spj_unlock_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spj_unlock_attempts ENABLE ROW LEVEL SECURITY;

-- Kode (hash) dan izin tidak boleh dibaca langsung; hanya lewat RPC. Admin boleh melihat riwayat percobaan/izin.
DROP POLICY IF EXISTS "Admin lihat izin buka kunci SPJ" ON public.spj_unlock_grants;
CREATE POLICY "Admin lihat izin buka kunci SPJ" ON public.spj_unlock_grants
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (public.has_role(auth.uid(), 'admin') AND school_key = COALESCE(public.get_user_school_id(), '00000000-0000-0000-0000-000000000000'::uuid)));

DROP POLICY IF EXISTS "Admin lihat percobaan buka kunci SPJ" ON public.spj_unlock_attempts;
CREATE POLICY "Admin lihat percobaan buka kunci SPJ" ON public.spj_unlock_attempts
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (public.has_role(auth.uid(), 'admin') AND school_key = COALESCE(public.get_user_school_id(), '00000000-0000-0000-0000-000000000000'::uuid)));

-- ---------------------------------------------------------------------------
-- Fungsi bantu
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spj_school_key()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.get_user_school_id(), '00000000-0000-0000-0000-000000000000'::uuid)
$$;

CREATE OR REPLACE FUNCTION public.spj_travel_has_spj(p_travel uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.payment_receipts r WHERE r.official_travel_id = p_travel AND r.is_spj)
$$;

CREATE OR REPLACE FUNCTION public.spj_has_travel_grant(p_travel uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.spj_unlock_grants g
                 WHERE g.user_id = auth.uid() AND g.travel_id = p_travel AND g.expires_at > now())
$$;

CREATE OR REPLACE FUNCTION public.spj_has_letter_grant(p_letter uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.spj_unlock_grants g
                 WHERE g.user_id = auth.uid() AND g.assignment_letter_id = p_letter AND g.expires_at > now())
$$;

-- SPD terkunci: ada kwitansi ber-SPJ dan pengguna belum memegang izin buka kunci.
CREATE OR REPLACE FUNCTION public.spj_travel_locked(p_travel uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_travel IS NOT NULL
     AND public.spj_travel_has_spj(p_travel)
     AND NOT public.spj_has_travel_grant(p_travel)
$$;

-- Surat tugas terkunci: dipakai SPD yang punya kwitansi ber-SPJ dan pengguna belum memegang izin buka kunci.
CREATE OR REPLACE FUNCTION public.spj_letter_locked(p_letter uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_letter IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.official_travel_letters t
                 WHERE t.assignment_letter_id = p_letter AND public.spj_travel_has_spj(t.id))
     AND NOT public.spj_has_letter_grant(p_letter)
$$;

-- ---------------------------------------------------------------------------
-- Fungsi trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spj_guard_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND OLD.is_spj AND NOT public.spj_has_travel_grant(OLD.official_travel_id) THEN
    RAISE EXCEPTION 'Kwitansi berstatus SPJ terkunci. Masukkan kode hapus dari admin untuk mengubah atau menghapusnya.'
      USING ERRCODE = '42501', HINT = 'SPJ_TERKUNCI';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.spj_guard_travel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.spj_travel_locked(OLD.id) THEN
    RAISE EXCEPTION 'SPD ini terkunci karena kwitansinya sudah berstatus SPJ. Masukkan kode hapus dari admin untuk mengubah atau menghapusnya.'
      USING ERRCODE = '42501', HINT = 'SPJ_TERKUNCI';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

-- Anak SPD (pelaksana guru/pengikut): official_travel_id
CREATE OR REPLACE FUNCTION public.spj_guard_travel_child()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old uuid; v_new uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := OLD.official_travel_id; END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := NEW.official_travel_id; END IF;
  IF public.spj_travel_locked(v_old) OR public.spj_travel_locked(v_new) THEN
    RAISE EXCEPTION 'SPD ini terkunci karena kwitansinya sudah berstatus SPJ. Masukkan kode hapus dari admin untuk mengubah atau menghapusnya.'
      USING ERRCODE = '42501', HINT = 'SPJ_TERKUNCI';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.spj_guard_letter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.spj_letter_locked(OLD.id) THEN
    RAISE EXCEPTION 'Surat tugas ini terkunci karena SPD-nya sudah berstatus SPJ. Masukkan kode hapus dari admin untuk mengubah atau menghapusnya.'
      USING ERRCODE = '42501', HINT = 'SPJ_TERKUNCI';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

-- Anak surat tugas (pelaksana guru/manual): assignment_letter_id
CREATE OR REPLACE FUNCTION public.spj_guard_letter_child()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old uuid; v_new uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := OLD.assignment_letter_id; END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := NEW.assignment_letter_id; END IF;
  IF public.spj_letter_locked(v_old) OR public.spj_letter_locked(v_new) THEN
    RAISE EXCEPTION 'Surat tugas ini terkunci karena SPD-nya sudah berstatus SPJ. Masukkan kode hapus dari admin untuk mengubah atau menghapusnya.'
      USING ERRCODE = '42501', HINT = 'SPJ_TERKUNCI';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.spj_guard_receipt(), public.spj_guard_travel(), public.spj_guard_travel_child(),
  public.spj_guard_letter(), public.spj_guard_letter_child() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS spj_lock_payment_receipts ON public.payment_receipts;
CREATE TRIGGER spj_lock_payment_receipts BEFORE UPDATE OR DELETE ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.spj_guard_receipt();

DROP TRIGGER IF EXISTS spj_lock_official_travel_letters ON public.official_travel_letters;
CREATE TRIGGER spj_lock_official_travel_letters BEFORE UPDATE OR DELETE ON public.official_travel_letters
  FOR EACH ROW EXECUTE FUNCTION public.spj_guard_travel();

DROP TRIGGER IF EXISTS spj_lock_official_travel_teachers ON public.official_travel_teachers;
CREATE TRIGGER spj_lock_official_travel_teachers BEFORE INSERT OR UPDATE OR DELETE ON public.official_travel_teachers
  FOR EACH ROW EXECUTE FUNCTION public.spj_guard_travel_child();

DROP TRIGGER IF EXISTS spj_lock_official_travel_followers ON public.official_travel_followers;
CREATE TRIGGER spj_lock_official_travel_followers BEFORE INSERT OR UPDATE OR DELETE ON public.official_travel_followers
  FOR EACH ROW EXECUTE FUNCTION public.spj_guard_travel_child();

DROP TRIGGER IF EXISTS spj_lock_assignment_letters ON public.assignment_letters;
CREATE TRIGGER spj_lock_assignment_letters BEFORE UPDATE OR DELETE ON public.assignment_letters
  FOR EACH ROW EXECUTE FUNCTION public.spj_guard_letter();

DROP TRIGGER IF EXISTS spj_lock_assignment_letter_teachers ON public.assignment_letter_teachers;
CREATE TRIGGER spj_lock_assignment_letter_teachers BEFORE INSERT OR UPDATE OR DELETE ON public.assignment_letter_teachers
  FOR EACH ROW EXECUTE FUNCTION public.spj_guard_letter_child();

DROP TRIGGER IF EXISTS spj_lock_assignment_letter_manual_executors ON public.assignment_letter_manual_executors;
CREATE TRIGGER spj_lock_assignment_letter_manual_executors BEFORE INSERT OR UPDATE OR DELETE ON public.assignment_letter_manual_executors
  FOR EACH ROW EXECUTE FUNCTION public.spj_guard_letter_child();

-- ---------------------------------------------------------------------------
-- RPC untuk aplikasi
-- ---------------------------------------------------------------------------

-- Admin menetapkan / mengganti kode hapus (disimpan sebagai hash bergaram, tidak bisa dibaca kembali).
CREATE OR REPLACE FUNCTION public.set_spj_unlock_code(p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text := btrim(COALESCE(p_code, '')); v_salt text;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_super_admin() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Hanya admin yang boleh menetapkan kode hapus' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_code) < 4 THEN
    RAISE EXCEPTION 'Kode hapus minimal 4 karakter' USING ERRCODE = '22023';
  END IF;
  v_salt := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.spj_lock_settings (school_key, code_salt, code_hash, updated_by, updated_at)
  VALUES (public.spj_school_key(), v_salt, encode(sha256(convert_to(v_salt || v_code, 'UTF8')), 'hex'), auth.uid(), now())
  ON CONFLICT (school_key) DO UPDATE
    SET code_salt = EXCLUDED.code_salt, code_hash = EXCLUDED.code_hash, updated_by = EXCLUDED.updated_by, updated_at = now();
  -- Mengganti kode mencabut semua izin buka kunci yang masih berlaku
  UPDATE public.spj_unlock_grants SET expires_at = now()
   WHERE school_key = public.spj_school_key() AND expires_at > now();
END $$;

-- Status kunci untuk tampilan: id SPD & surat tugas yang saat ini terkunci bagi pengguna, dan apakah kode sudah ditetapkan.
CREATE OR REPLACE FUNCTION public.get_spj_lock_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_travels jsonb; v_letters jsonb; v_set boolean; v_upd timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('locked_travels', '[]'::jsonb, 'locked_letters', '[]'::jsonb, 'code_set', false, 'code_updated_at', null); END IF;

  SELECT COALESCE(jsonb_agg(t.id), '[]'::jsonb) INTO v_travels
  FROM public.official_travel_letters t
  WHERE (public.is_super_admin() OR t.school_id IS NOT DISTINCT FROM public.get_user_school_id())
    AND public.spj_travel_has_spj(t.id)
    AND NOT public.spj_has_travel_grant(t.id);

  SELECT COALESCE(jsonb_agg(l.id), '[]'::jsonb) INTO v_letters
  FROM public.assignment_letters l
  WHERE (public.is_super_admin() OR l.school_id IS NOT DISTINCT FROM public.get_user_school_id())
    AND EXISTS (SELECT 1 FROM public.official_travel_letters t WHERE t.assignment_letter_id = l.id AND public.spj_travel_has_spj(t.id))
    AND NOT public.spj_has_letter_grant(l.id);

  SELECT true, s.updated_at INTO v_set, v_upd FROM public.spj_lock_settings s WHERE s.school_key = public.spj_school_key();

  RETURN jsonb_build_object('locked_travels', v_travels, 'locked_letters', v_letters,
                            'code_set', COALESCE(v_set, false), 'code_updated_at', v_upd);
END $$;

-- Memasukkan kode hapus. p_kind: 'receipt' | 'travel' | 'letter'. Hasil: {ok, reason?, expires_at?}.
-- Kode salah TIDAK melempar galat (agar percobaan tercatat); 5 kali salah dalam 10 menit memblokir akun itu 10 menit.
CREATE OR REPLACE FUNCTION public.unlock_spj(p_kind text, p_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key uuid := public.spj_school_key();
  v_set record;
  v_travels uuid[] := '{}';
  v_letters uuid[] := '{}';
  v_exp timestamptz := now() + interval '10 minutes';
  v_ok boolean;
  v_fails int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Harus login' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('receipt', 'travel', 'letter') OR p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tidak_valid');
  END IF;

  -- Cari data sasaran (hanya yang terlihat oleh sekolah pengguna)
  IF p_kind = 'receipt' THEN
    SELECT COALESCE(array_agg(t.id), '{}') INTO v_travels FROM public.payment_receipts r
      JOIN public.official_travel_letters t ON t.id = r.official_travel_id
      WHERE r.id = p_id AND (public.is_super_admin() OR t.school_id IS NOT DISTINCT FROM public.get_user_school_id());
  ELSIF p_kind = 'travel' THEN
    SELECT COALESCE(array_agg(t.id), '{}') INTO v_travels FROM public.official_travel_letters t
      WHERE t.id = p_id AND (public.is_super_admin() OR t.school_id IS NOT DISTINCT FROM public.get_user_school_id());
  ELSE
    SELECT COALESCE(array_agg(l.id), '{}') INTO v_letters FROM public.assignment_letters l
      WHERE l.id = p_id AND (public.is_super_admin() OR l.school_id IS NOT DISTINCT FROM public.get_user_school_id());
    SELECT COALESCE(array_agg(t.id), '{}') INTO v_travels FROM public.official_travel_letters t
      WHERE t.assignment_letter_id = p_id AND (public.is_super_admin() OR t.school_id IS NOT DISTINCT FROM public.get_user_school_id());
  END IF;
  IF p_kind <> 'letter' THEN
    SELECT COALESCE(array_agg(DISTINCT t.assignment_letter_id), '{}') INTO v_letters
      FROM public.official_travel_letters t WHERE t.id = ANY (v_travels) AND t.assignment_letter_id IS NOT NULL;
  END IF;
  IF cardinality(v_travels) = 0 AND cardinality(v_letters) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tidak_ditemukan');
  END IF;

  SELECT * INTO v_set FROM public.spj_lock_settings WHERE school_key = v_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'belum_diatur'); END IF;

  SELECT count(*) INTO v_fails FROM public.spj_unlock_attempts
   WHERE user_id = v_uid AND NOT success AND created_at > now() - interval '10 minutes';
  IF v_fails >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'dibatasi'); END IF;

  v_ok := encode(sha256(convert_to(v_set.code_salt || btrim(COALESCE(p_code, '')), 'UTF8')), 'hex') = v_set.code_hash;
  INSERT INTO public.spj_unlock_attempts (school_key, user_id, target_kind, target_id, success)
  VALUES (v_key, v_uid, p_kind, p_id, v_ok);
  IF NOT v_ok THEN RETURN jsonb_build_object('ok', false, 'reason', 'salah', 'sisa', GREATEST(0, 4 - v_fails)); END IF;

  INSERT INTO public.spj_unlock_grants (school_key, user_id, travel_id, expires_at)
    SELECT v_key, v_uid, x, v_exp FROM unnest(v_travels) AS x;
  INSERT INTO public.spj_unlock_grants (school_key, user_id, assignment_letter_id, expires_at)
    SELECT v_key, v_uid, x, v_exp FROM unnest(v_letters) AS x;
  RETURN jsonb_build_object('ok', true, 'expires_at', v_exp);
END $$;

REVOKE ALL ON FUNCTION public.spj_school_key(), public.spj_travel_has_spj(uuid), public.spj_has_travel_grant(uuid),
  public.spj_has_letter_grant(uuid), public.spj_travel_locked(uuid), public.spj_letter_locked(uuid),
  public.set_spj_unlock_code(text), public.get_spj_lock_state(), public.unlock_spj(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_spj_unlock_code(text), public.get_spj_lock_state(), public.unlock_spj(text, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
