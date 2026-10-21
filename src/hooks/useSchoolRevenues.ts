import { useQuery } from '@tanstack/react-query';
import { snpDb } from '@/hooks/usePenjabSnp';

export interface SchoolRevenue {
  id: string;
  fiscal_year: string;
  source: string;
  description: string | null;
  amount: number;
  /** 1..12, null = belum ditentukan */
  month: number | null;
  created_at: string;
}

export const SCHOOL_REVENUES_KEY = ['snp-school-revenues'];

export function useSchoolRevenues() {
  return useQuery({
    queryKey: SCHOOL_REVENUES_KEY,
    queryFn: async (): Promise<SchoolRevenue[]> => {
      const { data, error } = await snpDb.from('snp_school_revenues').select('*').order('fiscal_year', { ascending: false }).order('month', { nullsFirst: false }).order('created_at');
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) }));
    },
  });
}

/** Penerimaan per bulan: indeks 0..11, 12 = tanpa bulan. */
export function revenuePerMonth(rows: SchoolRevenue[]): number[] {
  const t = new Array(13).fill(0);
  rows.forEach((r) => { t[r.month ? r.month - 1 : 12] += r.amount; });
  return t;
}
