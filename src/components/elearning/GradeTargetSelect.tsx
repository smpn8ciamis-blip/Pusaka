import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import {
  NO_GRADE_TARGET, gradeTargetLabel, type GradeTargetOption,
} from '@/lib/elearning';

// RPC baru belum ada di types.ts yang digenerate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface TargetsResult {
  schedule_found: boolean;
  custom: boolean;
  items: GradeTargetOption[];
}

/** Daftar jenis penilaian (Tugas/Kuis/UTS/UAS/Praktik atau buatan guru) untuk satu kelas + mapel. */
export function useGradeTargets(classId: string | undefined, subject: string | undefined) {
  return useQuery({
    queryKey: ['elearning-grade-targets', classId, subject],
    enabled: !!classId && !!subject,
    staleTime: 30_000,
    queryFn: async (): Promise<TargetsResult> => {
      const { data, error } = await db.rpc('elearning_grade_targets', { p_class: classId, p_subject: subject });
      if (error) throw error;
      return data as TargetsResult;
    },
  });
}

interface Props {
  classId: string | undefined;
  subject: string | undefined;
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Pilih jenis penilaian tujuan nilai e-learning. Nilai "none" = tidak dialirkan ke menu Nilai. */
export function GradeTargetSelect({ classId, subject, value, onChange, disabled, className }: Props) {
  const { data, isLoading, isError } = useGradeTargets(classId, subject);

  const options = useMemo(() => {
    const items = data?.items ?? [];
    // pemetaan tersimpan yang sudah tidak ada di daftar (jenis dihapus / diganti nama) tetap ditampilkan
    if (value !== NO_GRADE_TARGET && !items.some((i) => i.key === value)) {
      return [...items, { key: value, label: `${gradeTargetLabel(value)} (tidak ditemukan)`, weight: 0 }];
    }
    return items;
  }, [data, value]);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || isLoading || isError}>
      <SelectTrigger className={className}>
        {isLoading ? (
          <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Memuat…</span>
        ) : (
          <SelectValue placeholder="Tidak masuk ke nilai" />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_GRADE_TARGET}>Tidak masuk ke nilai</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {o.label}{o.weight ? ` (${o.weight}%)` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
