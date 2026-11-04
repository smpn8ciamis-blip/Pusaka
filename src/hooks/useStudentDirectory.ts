import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import type { DirectoryStudent } from '@/lib/studentDirectory';

const PAGE = 1000; // batas baris per permintaan

/** Semua siswa (dibaca bertahap karena batas 1000 baris per permintaan). */
export function useDirectoryStudents() {
  return useQuery({
    queryKey: ['student-directory'],
    staleTime: 60_000,
    queryFn: async (): Promise<DirectoryStudent[]> => {
      const all: DirectoryStudent[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('students')
          .select('id, nis, nisn, full_name, gender, class_id, photo_url, parent_name, parent_phone, address, status, is_alumni, classes(name)')
          .order('full_name')
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...((data ?? []) as unknown as DirectoryStudent[]));
        if (!data || data.length < PAGE) break;
      }
      return all;
    },
  });
}

/** Kelas pada tahun ajaran terpilih (untuk filter). */
export function useDirectoryClasses() {
  const { selectedYear } = useAcademicYear();
  return useQuery({
    queryKey: ['student-directory-classes', selectedYear],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      let q = supabase.from('classes').select('id, name').order('name');
      if (selectedYear) q = q.eq('academic_year', selectedYear);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}
