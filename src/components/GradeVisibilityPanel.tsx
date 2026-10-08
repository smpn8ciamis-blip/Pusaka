import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Tabel baru belum ada di types.ts yang digenerate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ScheduleLike {
  class_id: string;
  subject: string;
  academic_year: string;
  classes?: { name: string } | null;
}

interface VisibilityRow {
  class_id: string;
  subject: string;
  academic_year: string;
  is_visible: boolean;
}

const keyOf = (c: string, s: string, y: string) => `${c}|${s}|${y}`;

/**
 * Guru mapel menentukan apakah nilai satu kelas+mapel terlihat oleh siswa.
 * Tanpa pengaturan = terlihat (perilaku lama).
 */
export function GradeVisibilityPanel({ schedules }: { schedules: ScheduleLike[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const groups = useMemo(() => {
    const map = new Map<string, ScheduleLike>();
    schedules.forEach((s) => {
      const k = keyOf(s.class_id, s.subject, s.academic_year);
      if (!map.has(k)) map.set(k, s);
    });
    return [...map.values()].sort((a, b) =>
      `${a.classes?.name ?? ''} ${a.subject}`.localeCompare(`${b.classes?.name ?? ''} ${b.subject}`),
    );
  }, [schedules]);

  const { data: rows = [] } = useQuery({
    queryKey: ['grade-visibility', groups.length],
    enabled: groups.length > 0,
    queryFn: async (): Promise<VisibilityRow[]> => {
      const { data, error } = await db
        .from('grade_visibility')
        .select('class_id, subject, academic_year, is_visible');
      if (error) throw error;
      return (data ?? []) as VisibilityRow[];
    },
  });

  const hidden = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (!r.is_visible) set.add(keyOf(r.class_id, r.subject, r.academic_year));
    });
    return set;
  }, [rows]);

  const toggle = useMutation({
    mutationFn: async (vars: { g: ScheduleLike; visible: boolean }) => {
      const { error } = await db.from('grade_visibility').upsert(
        {
          class_id: vars.g.class_id,
          subject: vars.g.subject,
          academic_year: vars.g.academic_year,
          is_visible: vars.visible,
          updated_by: user?.id ?? null,
        },
        { onConflict: 'class_id,subject,academic_year' },
      );
      if (error) throw error;
      return vars.visible;
    },
    onSuccess: (visible) => {
      queryClient.invalidateQueries({ queryKey: ['grade-visibility'] });
      toast.success(visible ? 'Nilai kini terlihat oleh siswa' : 'Nilai disembunyikan dari siswa');
    },
    onError: () => toast.error('Gagal mengubah visibilitas nilai'),
  });

  if (groups.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4 text-primary" /> Visibilitas Nilai untuk Siswa
        </CardTitle>
        <CardDescription>
          Atur per kelas dan mapel. Bila disembunyikan, siswa tidak melihat nilai mapel tersebut di akunnya.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const k = keyOf(g.class_id, g.subject, g.academic_year);
          const visible = !hidden.has(k);
          return (
            <label
              key={k}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{g.subject}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {g.classes?.name ?? 'Kelas'}
                  <Badge variant={visible ? 'secondary' : 'outline'} className="gap-1 px-1.5 text-[10px]">
                    {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {visible ? 'Terlihat' : 'Disembunyikan'}
                  </Badge>
                </span>
              </span>
              <Switch
                checked={visible}
                disabled={toggle.isPending}
                onCheckedChange={(v) => toggle.mutate({ g, visible: v })}
                aria-label={`Tampilkan nilai ${g.subject} ${g.classes?.name ?? ''} ke siswa`}
              />
            </label>
          );
        })}
      </CardContent>
    </Card>
  );
}
