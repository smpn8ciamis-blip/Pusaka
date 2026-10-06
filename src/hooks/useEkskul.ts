import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Tabel/RPC ekskul baru belum ada di types.ts yang digenerate, jadi klien di-cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ekskulDb = supabase as any;

export const EKSKUL_PHOTO_BUCKET = 'ekskul-journal-photos';

export interface EkskulType {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Daftar ekskul yang boleh diakses user saat ini:
 * - pembina_ekskul : hanya ekskul yang ditugaskan kepadanya
 * - admin/kesiswaan: semua ekskul aktif di sekolah
 */
export function useAccessibleEkskulTypes() {
  const { user, userRole } = useAuth();

  return useQuery({
    queryKey: ['ekskul-accessible-types', user?.id, userRole],
    enabled: !!user && !!userRole,
    queryFn: async (): Promise<EkskulType[]> => {
      if (userRole === 'pembina_ekskul') {
        const { data, error } = await ekskulDb
          .from('extracurricular_coaches')
          .select('extracurricular_types(id, name, description)')
          .eq('user_id', user!.id);
        if (error) throw error;
        return ((data ?? []) as Array<{ extracurricular_types: EkskulType | null }>)
          .map((row) => row.extracurricular_types)
          .filter((t): t is EkskulType => !!t)
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      const { data, error } = await ekskulDb
        .from('extracurricular_types')
        .select('id, name, description')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as EkskulType[];
    },
  });
}

/** Hanya pembina yang mengedit dari UI; admin & kesiswaan hanya memantau. */
export const canEditEkskul = (role: string | null | undefined) => role === 'pembina_ekskul';
