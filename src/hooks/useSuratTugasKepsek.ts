import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { KepsekLetterData } from '@/lib/suratTugasKepsekPdf';
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

/**
 * Data halaman Surat Tugas Dinas untuk paket SPPD kepsek, dari surat tugas yang ditautkan ke SPD.
 * null bila SPD belum tertaut ke surat tugas (paket tetap dicetak tanpa halaman surat tugas).
 */
export async function fetchKepsekSuratForTravel(travel: any): Promise<Omit<KepsekLetterData, 'pelaksana'> | null> {
  if (!travel?.assignment_letter_id) return null;
  const { data: a, error } = await db
    .from('assignment_letters')
    .select('letter_number, kepsek_letter_number, letter_date, description, location, start_date, end_date')
    .eq('id', travel.assignment_letter_id)
    .maybeSingle();
  if (error || !a) return null;
  const nomor = String(a.kepsek_letter_number || a.letter_number || '').trim();
  if (!nomor) return null;
  return {
    nomor,
    tanggal: String(a.letter_date || travel.letter_date || travel.departure_date).slice(0, 10),
    maksud: String(a.description || travel.purpose || ''),
    lokasi: String(a.location || travel.destination || ''),
    mulai: String(a.start_date || travel.departure_date).slice(0, 10),
    selesai: String(a.end_date || travel.return_date).slice(0, 10),
  };
}
