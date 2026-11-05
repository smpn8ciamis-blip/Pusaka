import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_NIS_PATTERN } from '@/lib/nis';

// RPC baru belum ada di types.ts yang digenerate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface IntakeSettings {
  nis_pattern: string;
  allow_direct: boolean;
  academic_year: string | null;
  semester: number | null;
}

/**
 * Aturan penambahan siswa: siswa baru pada tahun ajaran berjalan hanya lewat menu Mutasi Masuk.
 * `allowDirect` true bila admin membuka "Penerimaan awal tahun ajaran" (atau pengguna super admin);
 * tambah/impor siswa langsung di menu lain hanya diizinkan saat itu. Basis data ikut menegakkannya.
 */
export function useStudentIntake() {
  const { userRole } = useAuth();
  const canUse = userRole === 'admin' || userRole === 'kesiswaan' || userRole === 'tata_usaha' || userRole === 'super_admin';
  const q = useQuery({
    queryKey: ['mutasi-masuk-settings'],
    enabled: canUse,
    staleTime: 60_000,
    queryFn: async (): Promise<IntakeSettings> => {
      const { data, error } = await db.rpc('mutasi_masuk_settings');
      if (error) throw error;
      return { ...(data as IntakeSettings), nis_pattern: (data?.nis_pattern as string) || DEFAULT_NIS_PATTERN };
    },
  });
  return {
    settings: q.data,
    isLoading: canUse && q.isLoading,
    isError: q.isError,
    canUseMutasiMasuk: canUse,
    // belum terbaca / error / peran lain => anggap terkunci (basis data tetap penentu)
    allowDirect: userRole === 'super_admin' || !!q.data?.allow_direct,
  };
}
