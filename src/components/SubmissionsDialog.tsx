import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { SUBMISSION_BUCKET, formatFileSize, type ElearningMaterial, type ElearningSubmission } from '@/lib/elearning';
import { openStorageFile } from '@/lib/openStorageFile';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface StudentRow { id: string; full_name: string; nis: string | null }

function GradeBox({ sub, onSaved }: { sub: ElearningSubmission; onSaved: () => void }) {
  const [score, setScore] = useState(sub.score?.toString() ?? '');
  const [feedback, setFeedback] = useState(sub.teacher_feedback ?? '');

  useEffect(() => {
    setScore(sub.score?.toString() ?? '');
    setFeedback(sub.teacher_feedback ?? '');
  }, [sub.id, sub.score, sub.teacher_feedback]);

  const num = score.trim() === '' ? null : Number(score);
  const invalid = num !== null && (Number.isNaN(num) || num < 0 || num > 100);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from('elearning_submissions')
        .update({ score: num, teacher_feedback: feedback.trim() || null })
        .eq('id', sub.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Penilaian tersimpan'); onSaved(); },
    onError: () => toast.error('Gagal menyimpan penilaian'),
  });

  return (
    <div className="grid gap-2 border-t pt-3 sm:grid-cols-[110px_1fr_auto] sm:items-start">
      <Input
        type="number" min={0} max={100} inputMode="decimal" placeholder="Nilai 0–100"
        value={score} onChange={(e) => setScore(e.target.value)}
        aria-invalid={invalid}
      />
      <Textarea rows={2} placeholder="Komentar untuk siswa (opsional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <Button size="sm" disabled={invalid || save.isPending} onClick={() => save.mutate()}>
        {save.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />} Simpan
      </Button>
    </div>
  );
}

/** Guru melihat jawaban/rangkuman siswa pada satu materi dan memberi nilai. */
export function SubmissionsDialog({ material, onClose }: { material: ElearningMaterial | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: students = [], isLoading: sLoading } = useQuery({
    queryKey: ['submission-students', material?.class_id],
    enabled: !!material,
    queryFn: async (): Promise<StudentRow[]> => {
      const { data, error } = await supabase
        .from('students')
        .select('id, full_name, nis')
        .eq('class_id', material!.class_id)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const { data: subs = [], isLoading: subLoading } = useQuery({
    queryKey: ['material-submissions', material?.id],
    enabled: !!material,
    queryFn: async (): Promise<ElearningSubmission[]> => {
      const { data, error } = await db.from('elearning_submissions').select('*').eq('material_id', material!.id);
      if (error) throw error;
      return (data ?? []) as ElearningSubmission[];
    },
  });

  const byStudent = useMemo(() => new Map(subs.map((s) => [s.student_id, s])), [subs]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students
      .filter((s) => !term || `${s.full_name} ${s.nis ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => Number(!!byStudent.get(b.id)) - Number(!!byStudent.get(a.id)) || a.full_name.localeCompare(b.full_name));
  }, [students, search, byStudent]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['material-submissions', material?.id] });
    queryClient.invalidateQueries({ queryKey: ['submission-counts'] });
  };

  return (
    <Dialog open={!!material} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-6 pb-3 pr-12 pt-6">
          <DialogTitle className="truncate">Jawaban Siswa — {material?.title}</DialogTitle>
          <DialogDescription>
            {subs.length} dari {students.length} siswa sudah mengumpulkan.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cari siswa…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-6">
          {sLoading || subLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Tidak ada siswa.</p>
          ) : (
            rows.map((st) => {
              const sub = byStudent.get(st.id);
              return (
                <div key={st.id} className="space-y-2 rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{st.full_name}</p>
                      <p className="text-xs text-muted-foreground">{st.nis ?? ''}</p>
                    </div>
                    {sub ? (
                      <Badge variant={sub.graded_at ? 'default' : 'secondary'} className="shrink-0 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {sub.graded_at ? `Dinilai${sub.score !== null ? ` (${sub.score})` : ''}` : 'Terkumpul'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">Belum mengumpulkan</Badge>
                    )}
                  </div>

                  {sub && (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(sub.updated_at), 'd MMM yyyy, HH:mm', { locale: localeId })}
                      </p>
                      {sub.answer_text && (
                        <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm">{sub.answer_text}</p>
                      )}
                      {sub.file_path && (
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-primary underline"
                          onClick={() => openStorageFile(SUBMISSION_BUCKET, sub.file_path!, sub.file_name ?? undefined)}
                        >
                          <ExternalLink className="h-3 w-3" /> {sub.file_name} ({formatFileSize(sub.file_size)})
                        </button>
                      )}
                      <GradeBox sub={sub} onSaved={refresh} />
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
