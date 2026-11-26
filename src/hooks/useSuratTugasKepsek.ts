import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_KEPSEK_SETTINGS, mergeKepsekSettings, type KepsekLetterSettings } from '@/lib/suratTugasKepsek';

const db = supabase as any;
export const KEPSEK_SETTINGS_KEY = ['surat-tugas-kepsek-settings'];
const KEY = KEPSEK_SETTINGS_KEY;

/** Bila migrasi belum dijalankan (atau akun tidak berhak), dipakai nilai bawaan. */
export async function fetchKepsekLetterSettings(): Promise<KepsekLetterSettings> {
  const { data, error } = await db.rpc('surat_tugas_kepsek_settings');
  if (error) return DEFAULT_KEPSEK_SETTINGS;
  return mergeKepsekSettings(data);
}

/** Pengaturan format surat kepsek. */
export function useKepsekLetterSettings() {
  return useQuery({ queryKey: KEY, staleTime: 60_000, queryFn: fetchKepsekLetterSettings });
}

export function useSaveKepsekLetterSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: KepsekLetterSettings) => {
      const { error } = await db.rpc('surat_tugas_kepsek_save_settings', { p: v });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
