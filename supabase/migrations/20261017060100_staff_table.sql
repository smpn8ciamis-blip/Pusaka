-- Data staf sekolah (tata usaha & karyawan lain). Terpisah dari tabel guru.
CREATE TABLE IF NOT EXISTS public.staff (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid REFERENCES public.schools(id),
  user_id uuid UNIQUE,                       -- akun login (opsional)
  full_name text NOT NULL,
  staff_type text NOT NULL DEFAULT 'karyawan' CHECK (staff_type IN ('tata_usaha','karyawan')),
  position text,                             -- jabatan, mis. Operator, Satpam, Penjaga Sekolah
  nip text,
  phone text,
  email text,
  photo_url text,
  fingerprint_pin text,
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_fingerprint_pin_key ON public.staff(fingerprint_pin) WHERE fingerprint_pin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_school_id ON public.staff(school_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS auto_set_school_id_staff ON public.staff;
CREATE TRIGGER auto_set_school_id_staff BEFORE INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_school_id();

DROP POLICY IF EXISTS "school_isolation_staff" ON public.staff;
CREATE POLICY "school_isolation_staff" ON public.staff
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())
  WITH CHECK (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin());

DROP POLICY IF EXISTS "staff_admin_all" ON public.staff;
CREATE POLICY "staff_admin_all" ON public.staff FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());

-- Tata usaha, bendahara & kesiswaan boleh melihat daftar staf (untuk surat tugas / piket)
DROP POLICY IF EXISTS "staff_read_office" ON public.staff;
CREATE POLICY "staff_read_office" ON public.staff FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'tata_usaha') OR public.has_role(auth.uid(),'bendahara') OR public.has_role(auth.uid(),'kesiswaan'));

DROP POLICY IF EXISTS "staff_read_self" ON public.staff;
CREATE POLICY "staff_read_self" ON public.staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.staff_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS staff_touch ON public.staff;
CREATE TRIGGER staff_touch BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.staff_touch_updated_at();
