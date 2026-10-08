import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Loader2, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ELEARNING_ACCEPT, ELEARNING_MAX_BYTES, SUBMISSION_BUCKET, detectElearningKind, formatFileSize, safeFileName,
  type ElearningMaterial, type ElearningSubmission,
} from '@/lib/elearning';
import { prepareFile } from '@/lib/elearningUpload';
import { isPayloadTooLarge } from '@/lib/pdfCompress';
import { openStorageFile } from '@/lib/openStorageFile';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Props {
  material: ElearningMaterial | null;
  studentId?: string | null;
  onClose: () => void;
}

/** Siswa mengumpulkan jawaban/rangkuman (teks dan/atau file) untuk satu materi. */
export function StudentSubmissionDialog({ material, studentId, onClose }: Props) {
  const { schoolId } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [progress, setProgress] = useState('');

  const { data: existing, isLoading } = useQuery({
    queryKey: ['student-submission', material?.id, studentId],
    enabled: !!material && !!studentId,
    queryFn: async (): Promise<ElearningSubmission | null> => {
      const { data, error } = await db
        .from('elearning_submissions')
        .select('*')
        .eq('material_id', material!.id)
        .eq('student_id', studentId!)
        .maybeSingle();
      if (error) throw error;
      return data as ElearningSubmission | null;
    },
  });

  useEffect(() => {
    setText(existing?.answer_text ?? '');
    setFile(null);
    setRemoveFile(false);
    if (fileRef.current) fileRef.current.value = '';
  }, [existing, material?.id]);

  const graded = !!existing?.graded_at;
  const hasKeptFile = !!existing?.file_path && !removeFile && !file;
  const canSubmit = !graded && (text.trim().length > 0 || !!file || hasKeptFile);

  const pickFile = (f?: File) => {
    if (!f) return;
    if (!detectElearningKind(f)) {
      toast.error('Format tidak didukung. Gunakan gambar, PDF, atau DOCX.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (f.size > ELEARNING_MAX_BYTES) {
      toast.error('Ukuran file maksimal 20 MB');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setFile(f);
    setRemoveFile(false);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!material || !studentId || !schoolId) throw new Error('Data belum lengkap');

      let fileFields: Record<string, unknown> = {};
      let newPath: string | null = null;
      const notes: string[] = [];

      if (file) {
        const prep = await prepareFile(file, setProgress);
        setProgress('Mengunggah file…');
        newPath = `${schoolId}/${material.id}/${studentId}/${crypto.randomUUID()}-${safeFileName(prep.fileName)}`;
        const { error: upErr } = await supabase.storage
          .from(SUBMISSION_BUCKET)
          .upload(newPath, prep.upload, { contentType: prep.mime, upsert: false });
        if (upErr) throw upErr;
        fileFields = {
          file_path: newPath, file_name: prep.fileName, file_type: prep.kind,
          mime_type: prep.mime, file_size: prep.upload.size,
        };
        notes.push(...prep.notes);
      } else if (removeFile) {
        fileFields = { file_path: null, file_name: null, file_type: null, mime_type: null, file_size: null };
      }

      const { error } = await db.from('elearning_submissions').upsert(
        {
          material_id: material.id,
          student_id: studentId,
          answer_text: text.trim() || null,
          ...fileFields,
        },
        { onConflict: 'material_id,student_id' },
      );
      if (error) {
        if (newPath) await supabase.storage.from(SUBMISSION_BUCKET).remove([newPath]);
        throw error;
      }
      // File lama dihapus setelah data baru tersimpan
      if ((file || removeFile) && existing?.file_path) {
        await supabase.storage.from(SUBMISSION_BUCKET).remove([existing.file_path]);
      }
      return notes;
    },
    onSuccess: (notes) => {
      queryClient.invalidateQueries({ queryKey: ['student-submission', material?.id] });
      queryClient.invalidateQueries({ queryKey: ['student-submissions'] });
      toast.success('Jawaban berhasil dikumpulkan');
      notes.forEach((n) => toast.info(n));
      onClose();
    },
    onError: (err: { message?: string }) => {
      if (isPayloadTooLarge(err)) toast.error('File ditolak server karena terlalu besar. Kecilkan file lalu coba lagi.', { duration: 8000 });
      else toast.error(`Gagal mengumpulkan jawaban${err?.message ? `: ${err.message}` : ''}`);
    },
    onSettled: () => setProgress(''),
  });

  const fileLabel = file
    ? `${file.name} (${formatFileSize(file.size)})`
    : hasKeptFile
      ? `${existing!.file_name} (${formatFileSize(existing!.file_size)})`
      : 'Pilih file (opsional)';

  return (
    <Dialog open={!!material} onOpenChange={(o) => !o && !submit.isPending && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-6 pb-3 pr-12 pt-6">
          <DialogTitle className="truncate">Kumpulkan Jawaban</DialogTitle>
          <DialogDescription className="truncate">{material?.title} — {material?.subject}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-3">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              {existing && (
                <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-green-600" /> Sudah dikumpulkan
                    </span>
                    <Badge variant={graded ? 'default' : 'outline'}>{graded ? 'Sudah dinilai' : 'Menunggu penilaian'}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(existing.updated_at), "d MMM yyyy, HH:mm", { locale: localeId })}
                  </p>
                  {graded && (
                    <div className="pt-1">
                      {existing.score !== null && <p>Nilai: <b>{existing.score}</b></p>}
                      {existing.teacher_feedback && <p className="text-muted-foreground">Komentar guru: {existing.teacher_feedback}</p>}
                      <p className="pt-1 text-xs text-muted-foreground">Jawaban yang sudah dinilai tidak dapat diubah.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Jawaban / rangkuman</label>
                <Textarea
                  rows={6}
                  value={text}
                  disabled={graded}
                  maxLength={5000}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Tulis jawaban atau rangkuman materi di sini…"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Lampiran file (foto tugas, PDF, atau DOCX)</label>
                <input ref={fileRef} type="file" accept={ELEARNING_ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={graded} className="min-w-0 flex-1 justify-start" onClick={() => fileRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">{fileLabel}</span>
                  </Button>
                  {(file || hasKeptFile) && !graded && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      aria-label="Hapus lampiran"
                      onClick={() => { setFile(null); setRemoveFile(true); if (fileRef.current) fileRef.current.value = ''; }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {hasKeptFile && existing?.file_path && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-primary underline"
                    onClick={() => openStorageFile(SUBMISSION_BUCKET, existing.file_path!, existing.file_name ?? undefined)}
                  >
                    <ExternalLink className="h-3 w-3" /> Lihat lampiran yang tersimpan
                  </button>
                )}
                <p className="text-xs text-muted-foreground">File besar dikompres otomatis sebelum diunggah.</p>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={submit.isPending}>Tutup</Button>
          <Button onClick={() => submit.mutate()} disabled={!canSubmit || submit.isPending || isLoading}>
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submit.isPending ? (progress || 'Memproses…') : existing ? 'Perbarui Jawaban' : 'Kumpulkan'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
