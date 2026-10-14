import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Tabel/RPC penjab SNP belum ada di types.ts yang digenerate, jadi klien di-cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const snpDb = supabase as any;

export const SNP_BUCKET = 'snp-documents';
export const SNP_MAX_FILE_MB = 20;

export interface SnpStandard { id: string; code: string; name: string; sort_order: number }
export interface SnpAssignment { id: string; standard_id: string; user_id: string; full_name: string; nip: string | null }
export interface SnpSubtask {
  id: string; standard_id: string; title: string; description: string | null; sort_order: number;
  due_date: string | null; status: 'belum' | 'proses' | 'selesai'; progress_note: string | null;
}
export interface SnpDocCategory { id: string; name: string; sort_order: number }
export interface SnpDocType { id: string; category_id: string; name: string }
export interface SnpDocument {
  id: string; standard_id: string; subtask_id: string | null; category_id: string | null; type_id: string | null;
  title: string; description: string | null; file_path: string; file_name: string; file_size: number | null;
  mime_type: string | null; uploaded_by: string | null; uploader_name: string | null; from_admin: boolean; created_at: string;
  storage_kind?: 'bucket' | 'db'; chunk_count?: number; ready?: boolean;
}
export interface SnpRkaBatch {
  id: string; standard_id: string; fiscal_year: string | null; file_name: string | null;
  row_count: number; total_amount: number; created_at: string;
}
export interface SnpRkaItem {
  id: string; batch_id: string; standard_id: string; line_no: number | null; activity_name: string;
  description: string | null; volume: number; unit: string | null; unit_price: number; amount: number;
  months: number[]; month_label: string | null;
}

export const STATUS_LABEL: Record<SnpSubtask['status'], string> = { belum: 'Belum', proses: 'Proses', selesai: 'Selesai' };

export function useSnpStandards() {
  return useQuery({
    queryKey: ['snp-standards'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<SnpStandard[]> => {
      const { data, error } = await snpDb.from('snp_standards').select('*').order('sort_order');
      if (error) throw error;
      return (data ?? []) as SnpStandard[];
    },
  });
}

/** Standar yang ditugaskan kepada user saat ini (id standar). */
export function useMySnpStandardIds() {
  const { user, userRole } = useAuth();
  const eligible = userRole === 'teacher';
  const { data = [], isLoading } = useQuery({
    queryKey: ['snp-my-standards', user?.id],
    enabled: !!user && eligible,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await snpDb.from('snp_assignments').select('standard_id').eq('user_id', user!.id);
      if (error) throw error;
      return ((data ?? []) as Array<{ standard_id: string }>).map((r) => r.standard_id);
    },
  });
  return { isPenjab: eligible && data.length > 0, standardIds: data, isLoading: eligible && isLoading };
}

export const canManageSnp = (role: string | null | undefined) => role === 'admin' || role === 'super_admin';

export const formatBytes = (n: number | null | undefined) => {
  if (!n) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
