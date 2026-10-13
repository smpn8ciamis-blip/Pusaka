import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { snpDb, type SnpAssignment, type SnpSubtask } from '@/hooks/usePenjabSnp';

interface TeacherOpt { user_id: string; full_name: string; nip: string | null }

/** Khusus admin: penugasan penjab (boleh lebih dari satu) dan sub tugas (tab). */
export function ManageTab({
  standardId, assignments, subtasks,
}: { standardId: string; assignments: SnpAssignment[]; subtasks: SnpSubtask[] }) {
  const queryClient = useQueryClient();
  const [pickedUser, setPickedUser] = useState('');
  const [editing, setEditing] = useState<Partial<SnpSubtask> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SnpSubtask | null>(null);

  const { data: teachers = [] } = useQuery({
    queryKey: ['snp-teacher-options'],
    queryFn: async (): Promise<TeacherOpt[]> => {
      const { data, error } = await snpDb.rpc('snp_list_teachers');
      if (error) throw error;
      return (data ?? []) as TeacherOpt[];
    },
  });

  const assignedIds = new Set(assignments.map((a) => a.user_id));
  const options = teachers.filter((t) => !assignedIds.has(t.user_id));

  const refreshAssign = () => {
    queryClient.invalidateQueries({ queryKey: ['snp-assignments'] });
    queryClient.invalidateQueries({ queryKey: ['snp-my-standards'] });
    queryClient.invalidateQueries({ queryKey: ['snp-overview'] });
  };

  const assign = useMutation({
    mutationFn: async () => {
      const { error } = await snpDb.from('snp_assignments').insert({ standard_id: standardId, user_id: pickedUser });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Penjab ditambahkan'); setPickedUser(''); refreshAssign(); },
    onError: () => toast.error('Gagal menugaskan guru'),
  });
  const unassign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await snpDb.from('snp_assignments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Penugasan dicabut'); refreshAssign(); },
    onError: () => toast.error('Gagal mencabut penugasan'),
  });

  const refreshSub = () => {
    queryClient.invalidateQueries({ queryKey: ['snp-subtasks'] });
    queryClient.invalidateQueries({ queryKey: ['snp-overview'] });
  };

  const saveSub = useMutation({
    mutationFn: async (s: Partial<SnpSubtask>) => {
      const payload = {
        title: (s.title ?? '').trim(),
        description: (s.description ?? '').trim() || null,
        due_date: s.due_date || null,
      };
      if (!payload.title) throw new Error('Judul wajib diisi');
      if (s.id) {
        const { error } = await snpDb.from('snp_subtasks').update(payload).eq('id', s.id);
        if (error) throw error;
      } else {
        const next = subtasks.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1;
        const { error } = await snpDb.from('snp_subtasks').insert({ ...payload, standard_id: standardId, sort_order: next });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success('Sub tugas disimpan'); setEditing(null); refreshSub(); },
    onError: (e: unknown) => toast.error(e instanceof Error && e.message === 'Judul wajib diisi' ? e.message : 'Gagal menyimpan sub tugas'),
  });
  const delSub = useMutation({
    mutationFn: async (s: SnpSubtask) => {
      const { error } = await snpDb.from('snp_subtasks').delete().eq('id', s.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Sub tugas dihapus'); setDeleteTarget(null); refreshSub(); },
    onError: () => toast.error('Gagal menghapus sub tugas'),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Penanggung Jawab</CardTitle>
          <CardDescription>Satu standar boleh dipegang lebih dari satu guru. Standar ini akan muncul di akun guru yang ditugaskan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {assignments.length === 0 && <p className="text-sm text-muted-foreground">Belum ada penjab.</p>}
            {assignments.map((a) => (
              <Badge key={a.id} variant="secondary" className="gap-1 py-1 pr-1 text-sm font-normal">
                {a.full_name}
                <button type="button" className="rounded-full p-0.5 hover:bg-destructive/20" onClick={() => unassign.mutate(a.id)} aria-label={`Cabut ${a.full_name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <SearchableSelect
                value={pickedUser}
                onValueChange={setPickedUser}
                options={options.map((t) => ({ value: t.user_id, label: t.nip ? `${t.full_name} (${t.nip})` : t.full_name }))}
                placeholder="Pilih guru..."
                searchPlaceholder="Cari nama guru..."
              />
            </div>
            <Button onClick={() => assign.mutate()} disabled={!pickedUser || assign.isPending} className="gap-2">
              {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Tugaskan
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Sub Tugas</CardTitle>
              <CardDescription>Setiap sub tugas tampil sebagai tab tersendiri bagi penjab.</CardDescription>
            </div>
            <Button size="sm" className="gap-1" onClick={() => setEditing({ title: '', description: '', due_date: '' })}>
              <Plus className="h-4 w-4" /> Tambah Sub Tugas
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {subtasks.length === 0 && <p className="text-sm text-muted-foreground">Belum ada sub tugas.</p>}
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{s.title}</p>
                {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                {s.due_date && <p className="text-[11px] text-muted-foreground">Tenggat {new Date(`${s.due_date}T00:00:00`).toLocaleDateString('id-ID')}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(s)} aria-label="Ubah"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(s)} aria-label="Hapus"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? 'Ubah Sub Tugas' : 'Tambah Sub Tugas'}</DialogTitle></DialogHeader>
          {editing && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveSub.mutate(editing); }}>
              <div className="space-y-1.5">
                <Label>Judul</Label>
                <Input value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="mis. Analisis kebutuhan kurikulum" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Deskripsi</Label>
                <Textarea rows={4} value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tenggat (opsional)</Label>
                <Input type="date" value={editing.due_date ?? ''} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Batal</Button>
                <Button type="submit" disabled={saveSub.isPending || !(editing.title ?? '').trim()}>{saveSub.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus sub tugas?</AlertDialogTitle>
            <AlertDialogDescription>"{deleteTarget?.title}" akan dihapus. Dokumen yang terhubung tetap ada di tab Dokumen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && delSub.mutate(deleteTarget)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
