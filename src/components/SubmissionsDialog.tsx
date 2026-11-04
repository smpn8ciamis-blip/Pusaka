import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Eye, FileText, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import {
  NO_GRADE_TARGET, SUBMISSION_BUCKET, formatFileSize, gradeTargetKeyOf, gradeTargetLabel,
  type ElearningMaterial, type ElearningSubmission,
} from '@/lib/elearning';
import { SubmissionPreviewDialog, type PreviewItem } from '@/components/elearning/SubmissionPreviewDialog';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface StudentRow { id: string; full_name: string; nis: string | null; status: string | null; is_alumni: boolean | null }

/** Siswa aktif = status 'aktif' dan bukan alumni (sama dengan menu Siswa & Nilai). */
const isActiveStudent = (s: Pick<StudentRow, 'status' | 'is_alumni'>) => (s.status ?? 'aktif') === 'aktif' && !s.is_alumni;

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
  const [showInactive, setShowInactive] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const { data: students = [], isLoading: sLoading } = useQuery({
    queryKey: ['submission-students', material?.class_id],
    enabled: !!material,
    queryFn: async (): Promise<StudentRow[]> => {
      const { data, error } = await supabase
        .from('students')
        .select('id, full_name, nis, status, is_alumni')
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

  const inactiveCount = useMemo(() => students.filter((s) => !isActiveStudent(s)).length, [students]);
  const activeIds = useMemo(() => new Set(students.filter(isActiveStudent).map((s) => s.id)), [students]);
  const submittedActive = useMemo(() => subs.filter((x) => activeIds.has(x.student_id)).length, [subs, activeIds]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students
      .filter((s) => showInactive || isActiveStudent(s))
      .filter((s) => !term || `${s.full_name} ${s.nis ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => Number(!!byStudent.get(b.id)) - Number(!!byStudent.get(a.id)) || a.full_name.localeCompare(b.full_name));
  }, [students, search, byStudent, showInactive]);

  // Pratinjau: siswa yang sudah mengumpulkan (urutan sama dengan daftar di layar)
  const previewItems = useMemo<PreviewItem[]>(
    () => rows.flatMap((st) => {
      const sub = byStudent.get(st.id);
      return sub ? [{ sub, studentName: st.full_name }] : [];
    }),
    [rows, byStudent],
  );
  const openPreview = (studentId: string) => {
    const i = previewItems.findIndex((x) => x.sub.student_id === studentId);
    if (i >= 0) setPreviewIndex(i);
  };

  // Miniatur gambar jawaban (satu permintaan untuk semua gambar)
  const imagePaths = useMemo(
    () => subs.filter((x) => x.file_path && x.file_type === 'image').map((x) => x.file_path as string).sort(),
    [subs],
  );
  const { data: thumbs = {} } = useQuery({
    queryKey: ['submission-thumbs', material?.id, imagePaths.join('|')],
    enabled: !!material && imagePaths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrls(imagePaths, 3600);
      if (error) return {};
      const out: Record<string, string> = {};
      (data ?? []).forEach((d) => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl; });
      return out;
    },
  });

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
            {submittedActive} dari {activeIds.size} siswa aktif sudah mengumpulkan.
            {material && gradeTargetKeyOf(material) !== NO_GRADE_TARGET && (
              <span className="mt-1 block text-primary">
                Nilai yang disimpan otomatis masuk ke “{gradeTargetLabel(gradeTargetKeyOf(material))}” di menu Nilai.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cari siswa…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {inactiveCount > 0 && (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              Tampilkan siswa nonaktif/mutasi ({inactiveCount}) untuk melihat riwayat jawabannya
            </label>
          )}
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
                      <p className="truncate font-medium">
                        {st.full_name}
                        {!isActiveStudent(st) && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                            {st.is_alumni ? 'alumni' : (st.status ?? 'nonaktif')}
                          </span>
                        )}
                      </p>
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
                        sub.file_type === 'image' && thumbs[sub.file_path] ? (
                          <button
                            type="button"
                            className="block overflow-hidden rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            onClick={() => openPreview(st.id)}
                            title="Klik untuk memperbesar"
                          >
                            <img src={thumbs[sub.file_path]} alt={sub.file_name ?? 'Jawaban siswa'} loading="lazy" className="max-h-40 w-auto max-w-full object-contain" />
                          </button>
                        ) : (
                          <Button type="button" variant="outline" size="sm" className="h-auto justify-start gap-2 py-1.5 text-xs" onClick={() => openPreview(st.id)}>
                            {sub.file_type === 'image' ? <Eye className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                            <span className="truncate">Lihat {sub.file_name} ({formatFileSize(sub.file_size)})</span>
                          </Button>
                        )
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

      <SubmissionPreviewDialog
        items={previewItems}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setPreviewIndex(null)}
        footer={(item) => <GradeBox sub={item.sub} onSaved={refresh} />}
      />
    </Dialog>
  );
}
