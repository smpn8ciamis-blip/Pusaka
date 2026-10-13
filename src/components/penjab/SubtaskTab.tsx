import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { snpDb, STATUS_LABEL, type SnpSubtask } from '@/hooks/usePenjabSnp';
import { DocumentsPanel } from './DocumentsPanel';

export const statusClass = (s: SnpSubtask['status']) =>
  s === 'selesai' ? 'bg-emerald-100 text-emerald-700' : s === 'proses' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';

/** Isi satu tab sub tugas: deskripsi, status/progres, dan dokumen sub tugas tersebut. */
export function SubtaskTab({ subtask }: { subtask: SnpSubtask }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SnpSubtask['status']>(subtask.status);
  const [note, setNote] = useState(subtask.progress_note ?? '');

  useEffect(() => {
    setStatus(subtask.status);
    setNote(subtask.progress_note ?? '');
  }, [subtask.id, subtask.status, subtask.progress_note]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await snpDb.rpc('snp_update_subtask_progress', { _id: subtask.id, _status: status, _note: note });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Progres disimpan');
      queryClient.invalidateQueries({ queryKey: ['snp-subtasks'] });
      queryClient.invalidateQueries({ queryKey: ['snp-overview'] });
    },
    onError: () => toast.error('Gagal menyimpan progres'),
  });

  const dirty = status !== subtask.status || note.trim() !== (subtask.progress_note ?? '').trim();
  const overdue = subtask.due_date && subtask.status !== 'selesai' && new Date(`${subtask.due_date}T23:59:59`) < new Date();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{subtask.title}</CardTitle>
          {subtask.due_date && (
            <p className={`flex items-center gap-1 text-xs ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              <CalendarClock className="h-3.5 w-3.5" /> Tenggat {new Date(`${subtask.due_date}T00:00:00`).toLocaleDateString('id-ID', { dateStyle: 'long' })}
              {overdue && ' (terlambat)'}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {subtask.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{subtask.description}</p>}
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as SnpSubtask['status'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as SnpSubtask['status'][]).map((k) => <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Catatan progres</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Apa yang sudah dikerjakan / kendala" />
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="gap-2">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Simpan Progres
          </Button>
        </CardContent>
      </Card>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Dokumen sub tugas</h3>
        <DocumentsPanel standardId={subtask.standard_id} subtaskId={subtask.id} />
      </div>
    </div>
  );
}
