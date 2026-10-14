-- Anggaran per penjab: admin DAN bendahara dapat melihat & mengelola (CRUD) RKA semua standar.
-- Tidak mengubah akses penjab (tetap hanya standarnya sendiri).

CREATE OR REPLACE FUNCTION public.is_snp_finance()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'bendahara')
      OR public.is_super_admin()
$$;
REVOKE ALL ON FUNCTION public.is_snp_finance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_snp_finance() TO authenticated;

DROP POLICY IF EXISTS "snp_rka_batches_select" ON public.snp_rka_batches;
DROP POLICY IF EXISTS "snp_rka_batches_write" ON public.snp_rka_batches;
DROP POLICY IF EXISTS "snp_rka_items_select" ON public.snp_rka_items;
DROP POLICY IF EXISTS "snp_rka_items_write" ON public.snp_rka_items;

CREATE POLICY "snp_rka_batches_select" ON public.snp_rka_batches
  FOR SELECT TO authenticated
  USING (public.is_snp_finance() OR public.is_snp_penjab(standard_id));
CREATE POLICY "snp_rka_batches_write" ON public.snp_rka_batches
  FOR ALL TO authenticated
  USING (public.is_snp_finance() OR public.is_snp_penjab(standard_id))
  WITH CHECK (public.is_snp_finance() OR public.is_snp_penjab(standard_id));
CREATE POLICY "snp_rka_items_select" ON public.snp_rka_items
  FOR SELECT TO authenticated
  USING (public.is_snp_finance() OR public.is_snp_penjab(standard_id));
CREATE POLICY "snp_rka_items_write" ON public.snp_rka_items
  FOR ALL TO authenticated
  USING (public.is_snp_finance() OR public.is_snp_penjab(standard_id))
  WITH CHECK (public.is_snp_finance() OR public.is_snp_penjab(standard_id));

-- Daftar penjab per standar juga dapat dilihat bendahara (untuk dashboard anggaran)
CREATE OR REPLACE FUNCTION public.snp_get_assignments()
RETURNS TABLE (id uuid, standard_id uuid, user_id uuid, full_name text, nip text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.standard_id, a.user_id, p.full_name, t.nip
  FROM public.snp_assignments a
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.teachers t ON t.user_id = a.user_id
  WHERE (a.school_id = public.get_user_school_id() OR public.is_super_admin())
    AND (public.is_snp_finance() OR public.is_snp_penjab(a.standard_id))
  ORDER BY p.full_name
$$;
REVOKE ALL ON FUNCTION public.snp_get_assignments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snp_get_assignments() TO authenticated;
