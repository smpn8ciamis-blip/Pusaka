import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeSchedule, type ExamSession } from '@/lib/examSchedule';

export interface ExamSettings {
  id: string;
  school_name?: string | null;
  academic_year?: string | null;
  exam_name?: string | null;
  exam_schedule?: unknown;
  exam_card_settings?: unknown;
  [k: string]: unknown;
}

export const EXAM_SETTINGS_KEY = ['exam-settings'] as const;

/** Pengaturan ujian lewat fungsi server exam_settings_get (hanya kolom ujian; panitia tidak membaca tabel school_settings langsung). */
export function useExamSettings() {
  return useQuery({
    queryKey: EXAM_SETTINGS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<ExamSettings | null> => {
      const { data, error } = await (supabase as any).rpc('exam_settings_get');
      if (error) throw error;
      return (data as ExamSettings) ?? null;
    },
  });
}

export const scheduleOf = (s?: ExamSettings | null): ExamSession[] => normalizeSchedule(s?.exam_schedule);

export function useSaveExamSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { examName?: string | null; schedule?: ExamSession[] | null; cardSettings?: Record<string, unknown> | null }) => {
      const { data, error } = await (supabase as any).rpc('exam_settings_save', {
        p_exam_name: v.examName ?? null,
        p_exam_schedule: v.schedule ?? null,
        p_exam_card_settings: v.cardSettings ?? null,
      });
      if (error) throw error;
      return data as ExamSettings;
    },
    onSuccess: (data) => {
      qc.setQueryData(EXAM_SETTINGS_KEY, data);
      qc.invalidateQueries({ queryKey: ['school-settings'] });
    },
  });
}
