import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Tabel/RPC snapshot belum ada di types.ts yang digenerate, jadi klien di-cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const snapDb = supabase as any;

export interface StudentSnapshot {
  id: string;
  period: string;            // YYYY-MM-DD (akhir bulan)
  academic_year: string | null;
  class_id: string | null;
  class_name: string;
  grade: number;
  male: number;
  female: number;
  total: number;
  source: 'auto' | 'lazy' | 'manual';
  captured_at: string;
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
/** "2026-01-31" → "Januari 2026" (tanpa konversi zona waktu) */
export const periodLabel = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
};
export const periodShort = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1].slice(0, 3)} ${String(y).slice(2)}`;
};

export function useStudentSnapshots(academicYear: string | null, enabled = true) {
  return useQuery({
    queryKey: ['student-snapshots', academicYear],
    enabled: enabled && !!academicYear,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<StudentSnapshot[]> => {
      const all: StudentSnapshot[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await snapDb.from('student_count_snapshots').select('*')
          .eq('academic_year', academicYear).order('period', { ascending: false }).order('class_name').range(from, from + 999);
        if (error) throw error;
        all.push(...((data ?? []) as StudentSnapshot[]));
        if (!data || data.length < 1000) break;
      }
      return all;
    },
  });
}

/** Saat dashboard dibuka admin/kesiswaan: susul snapshot akhir bulan lalu bila belum terekam. */
export function useEnsureStudentSnapshots(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await snapDb.rpc('ensure_student_snapshots');
      if (!cancelled && !error && data === true) queryClient.invalidateQueries({ queryKey: ['student-snapshots'] });
    })();
    return () => { cancelled = true; };
  }, [enabled, queryClient]);
}
