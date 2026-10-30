import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_COMPONENTS,
  fromRows,
  toRpcItems,
  type GradeComponent,
} from '@/lib/gradeComponents';

// Tabel/RPC baru belum ada di types.ts yang digenerate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Jenis penilaian efektif satu jadwal: buatan guru, atau rumus lama bila belum diatur. */
export function useGradeComponents(scheduleId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['grade-components', scheduleId],
    enabled: !!scheduleId,
    queryFn: async () => {
      const { data, error } = await db
        .from('grade_components')
        .select('id, name, weight, legacy_key, sort_order')
        .eq('schedule_id', scheduleId);
      if (error) throw error;
      return fromRows(data);
    },
  });
  const custom = query.data ?? [];
  const isDefault = custom.length === 0;
  const components: GradeComponent[] = isDefault ? DEFAULT_COMPONENTS : custom;
  return { components, isDefault, isLoading: query.isLoading, error: query.error };
}

/** Nilai komponen buatan guru untuk satu jadwal: studentId -> componentId -> nilai. */
export function useCustomScores(scheduleId: string | null | undefined) {
  return useQuery({
    queryKey: ['grade-scores', scheduleId],
    enabled: !!scheduleId,
    queryFn: async () => {
      const { data, error } = await db
        .from('grade_scores')
        .select('student_id, component_id, score')
        .eq('schedule_id', scheduleId)
        .limit(5000);
      if (error) throw error;
      const map: Record<string, Record<string, number>> = {};
      for (const r of (data ?? []) as any[]) {
        (map[r.student_id] ??= {})[r.component_id] = Number(r.score);
      }
      return map;
    },
  });
}

export function useSaveGradeComponents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { scheduleId: string; items: GradeComponent[]; applyParallel: boolean }) => {
      const { data, error } = await db.rpc('grade_save_components', {
        p_schedule: args.scheduleId,
        p_items: toRpcItems(args.items),
        p_apply_parallel: args.applyParallel,
      });
      if (error) throw error;
      return data as { schedules: number; components: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grade-components'] });
      qc.invalidateQueries({ queryKey: ['grade-scores'] });
      qc.invalidateQueries({ queryKey: ['schedule-students-grades'] });
    },
  });
}

/** Ambil jenis penilaian jadwal lain (untuk fitur "salin dari mapel lain"). */
export async function fetchComponentsOf(scheduleId: string): Promise<GradeComponent[]> {
  const { data, error } = await db
    .from('grade_components')
    .select('id, name, weight, legacy_key, sort_order')
    .eq('schedule_id', scheduleId);
  if (error) throw error;
  const rows = fromRows(data);
  // id dikosongkan: komponen salinan dianggap baru / dicocokkan lewat kunci & nama
  return (rows.length ? rows : DEFAULT_COMPONENTS).map((c) => ({ ...c, id: null }));
}
