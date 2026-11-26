-- Satu akun = satu perangkat. Login terakhir yang menang: perangkat lain otomatis keluar.
-- Aplikasi memanggil device_claim() setelah login berhasil dan device_status() berkala.
-- Aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS public.active_devices (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_label text,
  logged_in_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.active_devices ENABLE ROW LEVEL SECURITY;
-- Tanpa kebijakan: tabel hanya disentuh lewat fungsi di bawah (SECURITY DEFINER).
REVOKE ALL ON public.active_devices FROM PUBLIC, anon, authenticated;

-- Menandai perangkat ini sebagai satu-satunya yang aktif untuk akun yang sedang login.
-- Sekaligus (sebisanya) mencabut sesi Supabase lain milik akun ini, sehingga token perangkat lama tidak bisa diperbarui.
CREATE OR REPLACE FUNCTION public.device_claim(p_device_id text, p_label text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Belum login'; END IF;
  IF p_device_id IS NULL OR char_length(btrim(p_device_id)) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'ID perangkat tidak valid';
  END IF;

  INSERT INTO public.active_devices (user_id, device_id, device_label, logged_in_at)
  VALUES (v_uid, btrim(p_device_id), left(btrim(coalesce(p_label, '')), 120), now())
  ON CONFLICT (user_id) DO UPDATE
    SET device_id = EXCLUDED.device_id, device_label = EXCLUDED.device_label, logged_in_at = EXCLUDED.logged_in_at;

  -- Hanya bila id sesi ada di token; tanpa itu jangan menghapus apa pun (bisa memutus sesi sendiri).
  BEGIN
    v_sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
    IF v_sid IS NOT NULL THEN
      DELETE FROM auth.sessions WHERE user_id = v_uid AND id <> v_sid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- versi/izin auth berbeda: pemeriksaan di aplikasi tetap berjalan
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.device_claim(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.device_claim(text, text) TO authenticated;

-- Apakah perangkat ini masih perangkat aktif akun? ok = true bila belum ada catatan (akun lama) atau id cocok.
CREATE OR REPLACE FUNCTION public.device_status(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.active_devices;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Belum login'; END IF;
  SELECT * INTO r FROM public.active_devices WHERE user_id = auth.uid();
  IF NOT FOUND OR r.device_id = btrim(coalesce(p_device_id, '')) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  RETURN jsonb_build_object('ok', false, 'label', r.device_label, 'logged_in_at', r.logged_in_at);
END;
$$;
REVOKE ALL ON FUNCTION public.device_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.device_status(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
