import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Tabel/RPC ekskul baru belum ada di types.ts yang digenerate, jadi klien di-cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ekskulDb = supabase as any;

/**
 * Role yang bisa mendapat akses pembina lewat PENUGASAN (baris extracurricular_coaches):
 * guru, serta akun dari Registrasi Staf/Akun (staf, tata usaha, bendahara, guru piket).
 */
export const EKSKUL_ASSIGNABLE_ROLES = ['teacher', 'staf', 'tata_usaha', 'bendahara', 'guru_piket'];
export const isEkskulAssignableRole = (role: string | null | undefined) =>
  !!role && EKSKUL_ASSIGNABLE_ROLES.includes(role);

export const EKSKUL_PHOTO_BUCKET = 'ekskul-journal-photos';

export interface EkskulType {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Daftar ekskul yang boleh diakses user saat ini:
 * - pembina_ekskul / guru / staf yang ditugaskan: hanya ekskul yang ditugaskan kepadanya
 * - admin/kesiswaan: semua ekskul aktif di sekolah
 */
export function useAccessibleEkskulTypes() {
  const { user, userRole } = useAuth();

  return useQuery({
    queryKey: ['ekskul-accessible-types', user?.id, userRole],
    enabled: !!user && !!userRole,
    queryFn: async (): Promise<EkskulType[]> => {
      // pembina_ekskul & guru yang ditugaskan: hanya ekskul binaannya
      if (userRole === 'pembina_ekskul' || isEkskulAssignableRole(userRole)) {
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

/**
 * Apakah user saat ini pembina ekskul? True untuk role pembina_ekskul, atau
 * guru (role teacher) yang ditugaskan kesiswaan pada minimal satu ekskul.
 */
export function useIsEkskulCoach() {
  const { user, userRole } = useAuth();
  const eligible = userRole === 'pembina_ekskul' || isEkskulAssignableRole(userRole);

  const { data = [], isLoading } = useQuery({
    queryKey: ['ekskul-my-coach-types', user?.id],
    enabled: !!user && eligible,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await ekskulDb
        .from('extracurricular_coaches')
        .select('extracurricular_type_id')
        .eq('user_id', user!.id);
      if (error) throw error;
      return ((data ?? []) as Array<{ extracurricular_type_id: string }>).map((r) => r.extracurricular_type_id);
    },
  });

  return {
    isCoach: eligible && (userRole === 'pembina_ekskul' || data.length > 0),
    typeIds: data,
    isLoading: eligible && isLoading,
  };
}

/** Jurnal ekskul: diisi pembina (role pembina_ekskul atau guru yang ditugaskan); admin & kesiswaan memantau. */
export const canEditEkskul = (role: string | null | undefined, isCoach = false) =>
  role === 'pembina_ekskul' || (isEkskulAssignableRole(role) && isCoach);

/** Anggota ekskul: dikelola pembina (ekskul binaannya) dan kesiswaan (semua ekskul). */
export const canManageEkskulMembers = (role: string | null | undefined, isCoach = false) =>
  role === 'pembina_ekskul' || role === 'kesiswaan' || (isEkskulAssignableRole(role) && isCoach);

/** Jenis ekskul: dikelola kesiswaan dan admin. */
export const canManageEkskulTypes = (role: string | null | undefined) =>
  role === 'kesiswaan' || role === 'admin';
