-- Siswa menandai notifikasinya sendiri sebagai sudah dibaca (tanpa membuka hak UPDATE penuh)
CREATE OR REPLACE FUNCTION public.mark_my_notifications_read(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.student_notifications sn
     SET is_read = true
   WHERE sn.id = ANY(_ids)
     AND sn.is_read = false
     AND sn.student_id IN (SELECT sa.student_id FROM public.student_accounts sa WHERE sa.user_id = auth.uid());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_my_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_my_notifications_read(uuid[]) TO authenticated;
