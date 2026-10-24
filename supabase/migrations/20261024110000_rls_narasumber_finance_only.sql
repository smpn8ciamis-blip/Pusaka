-- Data honorarium narasumber (nominal, pajak) hanya untuk peran keuangan.
-- Sebelumnya: INSERT terbuka untuk semua akun login, dan SELECT/UPDATE/DELETE hanya dibatasi sekolah
-- (siswa dan guru biasa bisa membaca atau mengubah nominal honorarium).

CREATE OR REPLACE FUNCTION public._is_finance_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'tata_usaha') OR public.has_role(auth.uid(), 'bendahara')
      OR public.has_role(auth.uid(), 'admin') OR public.is_super_admin()
$$;
REVOKE ALL ON FUNCTION public._is_finance_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_finance_staff() TO authenticated;

DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['narasumber_types','narasumber_instructors','narasumber_honorariums'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public._is_finance_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin()))', t||'_finance_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public._is_finance_staff())', t||'_finance_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public._is_finance_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin()))', t||'_finance_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public._is_finance_staff() AND (school_id = public.get_user_school_id() OR public.is_super_admin()))', t||'_finance_delete', t);
  END LOOP;
END $$;
