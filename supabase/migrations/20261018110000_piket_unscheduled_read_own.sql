-- Guru/staf dapat melihat absen piket tanpa jadwal milik sendiri (status menunggu konfirmasi / diabaikan) di Log Piket Saya.
DROP POLICY IF EXISTS "piket_unscheduled_read_own" ON public.piket_unscheduled;
CREATE POLICY "piket_unscheduled_read_own" ON public.piket_unscheduled FOR SELECT TO authenticated
  USING ((staff_id IS NOT NULL AND staff_id = public.my_staff_id())
      OR (teacher_id IS NOT NULL AND teacher_id = public.my_teacher_id()));
