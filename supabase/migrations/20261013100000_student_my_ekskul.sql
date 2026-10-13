-- ============================================================
-- Siswa melihat ekstrakurikuler yang diikutinya
-- Siswa tidak punya akses SELECT langsung ke extracurricular_members
-- (hanya admin/kesiswaan/pembina), jadi dibuat RPC SECURITY DEFINER
-- yang hanya mengembalikan data milik siswa yang sedang login.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_ekskul()
RETURNS TABLE (
  member_id uuid,
  type_id uuid,
  name text,
  description text,
  status text,
  joined_at date,
  notes text,
  coaches text,
  meeting_count integer,
  last_meeting date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    t.id,
    t.name,
    t.description,
    m.status,
    m.joined_at,
    m.notes,
    NULLIF(concat_ws(', ',
      (SELECT string_agg(DISTINCT p.full_name, ', ')
         FROM public.extracurricular_coaches c
         JOIN public.profiles p ON p.id = c.user_id
        WHERE c.extracurricular_type_id = t.id),
      (SELECT string_agg(DISTINCT i.name, ', ')
         FROM public.extracurricular_instructors i
        WHERE i.extracurricular_type_id = t.id AND i.is_active)
    ), '') AS coaches,
    (SELECT count(*)::int FROM public.extracurricular_journals j
      WHERE j.extracurricular_type_id = t.id) AS meeting_count,
    (SELECT max(j.meeting_date) FROM public.extracurricular_journals j
      WHERE j.extracurricular_type_id = t.id) AS last_meeting
  FROM public.extracurricular_members m
  JOIN public.extracurricular_types t ON t.id = m.extracurricular_type_id
  WHERE m.student_id IN (
    SELECT sa.student_id FROM public.student_accounts sa WHERE sa.user_id = auth.uid()
  )
  AND m.status <> 'keluar'
  ORDER BY (m.status = 'aktif') DESC, t.name
$$;

REVOKE ALL ON FUNCTION public.get_my_ekskul() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ekskul() TO authenticated;
