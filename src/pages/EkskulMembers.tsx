import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Printer, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { canManageEkskulMembers, ekskulDb, useAccessibleEkskulTypes } from '@/hooks/useEkskul';
import { EkskulPrintDialog } from '@/components/EkskulPrintDialog';

interface Member {
  id: string;
  extracurricular_type_id: string;
  student_id: string;
  status: 'aktif' | 'nonaktif' | 'keluar';
  joined_at: string;
  notes: string | null;
  full_name: string;
  nis: string;
  gender: string | null;
  class_name: string | null;
}

interface DirectoryStudent {
  id: string;
  full_name: string;
  nis: string;
  nisn: string | null;
  gender: string | null;
  class_name: string | null;
}

const STATUS_LABEL: Record<Member['status'], string> = {
  aktif: 'Aktif',
  nonaktif: 'Nonaktif',
  keluar: 'Keluar',
};

const statusVariant = (s: Member['status']) =>
  s === 'aktif' ? 'default' : s === 'nonaktif' ? 'secondary' : 'outline';

const PICKER_LIMIT = 100;

export default function EkskulMembers() {
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = canManageEkskulMembers(userRole);
  const isPembina = userRole === 'pembina_ekskul';

  const { data: types = [], isLoading: typesLoading } = useAccessibleEkskulTypes();
  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);

  const [selectedType, setSelectedType] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Pembina & kesiswaan: auto-pilih ekskul pertama (agar tombol Tambah langsung aktif); admin melihat semua.
  const activeType = selectedType || (canEdit ? types[0]?.id ?? '' : 'all');

  const [addOpen, setAddOpen] = useState(false);
  const [pickSearch, setPickSearch] = useState('');
  const [pickClass, setPickClass] = useState('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<Member | null>(null);
  const [editStatus, setEditStatus] = useState<Member['status']>('aktif');
  const [editNotes, setEditNotes] = useState('');
  const [editJoined, setEditJoined] = useState('');

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['ekskul-members', activeType],
    enabled: types.length > 0 && !!activeType,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await ekskulDb.rpc('get_ekskul_members', {
        _type_id: activeType === 'all' ? null : activeType,
      });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const visibleMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return members.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!term) return true;
      return [m.full_name, m.nis, m.class_name].some((v) => v?.toLowerCase().includes(term));
    });
  }, [members, search, statusFilter]);

  const activeCount = members.filter((m) => m.status === 'aktif').length;

  const { data: directory = [], isFetching: directoryLoading } = useQuery({
    queryKey: ['ekskul-student-directory', activeType],
    enabled: addOpen && canEdit && !!activeType && activeType !== 'all',
    queryFn: async (): Promise<DirectoryStudent[]> => {
      const { data, error } = await ekskulDb.rpc('get_ekskul_student_directory', { _type_id: activeType });
      if (error) throw error;
      return (data ?? []) as DirectoryStudent[];
    },
  });

  const memberStudentIds = useMemo(() => new Set(members.map((m) => m.student_id)), [members]);
  const classOptions = useMemo(
    () => Array.from(new Set(directory.map((s) => s.class_name).filter(Boolean) as string[])).sort(),
    [directory],
  );

  const candidates = useMemo(() => {
    const term = pickSearch.trim().toLowerCase();
    return directory.filter((s) => {
      if (memberStudentIds.has(s.id)) return false;
      if (pickClass !== 'all' && s.class_name !== pickClass) return false;
      if (!term) return true;
      return [s.full_name, s.nis, s.nisn, s.class_name].some((v) => v?.toLowerCase().includes(term));
    });
  }, [directory, memberStudentIds, pickSearch, pickClass]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const addMembers = useMutation({
    mutationFn: async () => {
      const rows = Array.from(picked).map((studentId) => ({
        extracurricular_type_id: activeType,
        student_id: studentId,
        joined_at: format(new Date(), 'yyyy-MM-dd'),
      }));
      const { error } = await ekskulDb.from('extracurricular_members').insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['ekskul-members'] });
      toast.success(`${count} siswa ditambahkan`);
      setPicked(new Set());
      setAddOpen(false);
    },
    onError: () => toast.error('Gagal menambahkan anggota (mungkin sudah terdaftar)'),
  });

  const updateMember = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await ekskulDb
        .from('extracurricular_members')
        .update({ status: editStatus, notes: editNotes.trim() || null, joined_at: editJoined })
        .eq('id', editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ekskul-members'] });
      toast.success('Data anggota diperbarui');
      setEditing(null);
    },
    onError: () => toast.error('Gagal memperbarui anggota'),
  });

  const removeMember = useMutation({
    mutationFn: async (m: Member) => {
      const { error } = await ekskulDb.from('extracurricular_members').delete().eq('id', m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ekskul-members'] });
      toast.success('Anggota dihapus dari ekskul');
      setRemoveTarget(null);
    },
    onError: () => toast.error('Gagal menghapus anggota'),
  });

  const openEdit = (m: Member) => {
    setEditing(m);
    setEditStatus(m.status);
    setEditNotes(m.notes ?? '');
    setEditJoined(m.joined_at);
  };

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const noAssignment = !typesLoading && types.length === 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Users className="h-6 w-6 text-primary" /> Anggota Ekstrakurikuler
            </h1>
            <p className="text-sm text-muted-foreground">
              {isPembina
                ? 'Kelola daftar siswa yang mengikuti ekskul yang Anda bina.'
                : canEdit
                  ? 'Kelola keanggotaan siswa di setiap ekstrakurikuler.'
                  : 'Daftar siswa anggota setiap ekstrakurikuler.'}
            </p>
          </div>
          {!noAssignment && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPrintOpen(true)}>
                <Printer className="mr-2 h-4 w-4" /> Daftar Hadir
              </Button>
              {canEdit && (
                <Button onClick={() => { setPicked(new Set()); setPickSearch(''); setPickClass('all'); setAddOpen(true); }} disabled={!activeType || activeType === 'all'} title={activeType === 'all' ? 'Pilih satu ekskul terlebih dahulu' : undefined}>
                  <UserPlus className="mr-2 h-4 w-4" /> Tambah Anggota
                </Button>
              )}
            </div>
          )}
        </div>

        {noAssignment ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {isPembina ? (
                'Akun Anda belum ditugaskan ke ekstrakurikuler mana pun. Hubungi admin sekolah untuk penugasan pembina.'
              ) : canEdit ? (
                <>
                  Belum ada ekstrakurikuler aktif.{' '}
                  <Link to="/ekskul-types" className="text-primary underline">Tambahkan jenis ekskul</Link> terlebih dahulu.
                </>
              ) : (
                'Belum ada ekstrakurikuler aktif.'
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Ekstrakurikuler</Label>
                  <Select value={activeType} onValueChange={setSelectedType}>
                    <SelectTrigger><SelectValue placeholder="Pilih ekskul" /></SelectTrigger>
                    <SelectContent>
                      {!isPembina && <SelectItem value="all">Semua ekskul</SelectItem>}
                      {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua status</SelectItem>
                      <SelectItem value="aktif">Aktif</SelectItem>
                      <SelectItem value="nonaktif">Nonaktif</SelectItem>
                      <SelectItem value="keluar">Keluar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Cari siswa</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Nama, NIS, atau kelas..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="text-sm text-muted-foreground">
              {members.length} terdaftar · {activeCount} aktif
            </p>

            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : visibleMembers.length === 0 ? (
                  <p className="py-10 text-center text-muted-foreground">Belum ada anggota.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nama</TableHead>
                          <TableHead>NIS</TableHead>
                          <TableHead>Kelas</TableHead>
                          {activeType === 'all' && <TableHead>Ekskul</TableHead>}
                          <TableHead>Bergabung</TableHead>
                          <TableHead>Status</TableHead>
                          {canEdit && <TableHead className="text-right">Aksi</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleMembers.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">
                              {m.full_name}
                              {m.notes && <p className="text-xs font-normal text-muted-foreground">{m.notes}</p>}
                            </TableCell>
                            <TableCell>{m.nis}</TableCell>
                            <TableCell>{m.class_name ?? '-'}</TableCell>
                            {activeType === 'all' && <TableCell>{typeName.get(m.extracurricular_type_id) ?? '-'}</TableCell>}
                            <TableCell>{format(new Date(`${m.joined_at}T00:00:00`), 'dd/MM/yyyy')}</TableCell>
                            <TableCell><Badge variant={statusVariant(m.status)}>{STATUS_LABEL[m.status]}</Badge></TableCell>
                            {canEdit && (
                              <TableCell className="text-right">
                                <Button size="icon" variant="ghost" onClick={() => openEdit(m)} aria-label="Ubah"><Pencil className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setRemoveTarget(m)} aria-label="Hapus"><Trash2 className="h-4 w-4" /></Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <EkskulPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        types={types}
        defaultTypeId={activeType}
        defaultKind="attendance"
      />

      {/* ----------------------------- Tambah anggota ----------------------------- */}
      <Dialog open={addOpen} onOpenChange={(o) => !addMembers.isPending && setAddOpen(o)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Tambah Anggota — {typeName.get(activeType) ?? ''}</DialogTitle>
            <DialogDescription>Centang siswa yang akan ditambahkan. Siswa yang sudah terdaftar tidak ditampilkan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Cari nama / NIS / NISN..." value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} />
            </div>
            <Select value={pickClass} onValueChange={setPickClass}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kelas</SelectItem>
                {classOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {directoryLoading ? (
              <div className="space-y-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : candidates.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Tidak ada siswa yang cocok.</p>
            ) : (
              <>
                {candidates.slice(0, PICKER_LIMIT).map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-0 hover:bg-muted/50">
                    <Checkbox checked={picked.has(s.id)} onCheckedChange={() => togglePick(s.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">{s.nis} · {s.class_name ?? 'Tanpa kelas'}</p>
                    </div>
                  </label>
                ))}
                {candidates.length > PICKER_LIMIT && (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    Menampilkan {PICKER_LIMIT} dari {candidates.length} siswa. Persempit dengan pencarian atau filter kelas.
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">{picked.size} siswa dipilih</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addMembers.isPending}>Batal</Button>
              <Button onClick={() => addMembers.mutate()} disabled={picked.size === 0 || addMembers.isPending}>
                {addMembers.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Tambahkan
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------- Ubah anggota ----------------------------- */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah Anggota</DialogTitle>
            <DialogDescription>{editing?.full_name} · {editing?.class_name ?? 'Tanpa kelas'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Status keanggotaan</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as Member['status'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktif">Aktif</SelectItem>
                  <SelectItem value="nonaktif">Nonaktif</SelectItem>
                  <SelectItem value="keluar">Keluar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal bergabung</Label>
              <Input type="date" value={editJoined} onChange={(e) => setEditJoined(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Jabatan, prestasi, atau keterangan lain..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={updateMember.isPending}>Batal</Button>
            <Button onClick={() => updateMember.mutate()} disabled={updateMember.isPending || !editJoined}>
              {updateMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------- Hapus anggota ----------------------------- */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keluarkan dari ekskul?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.full_name} akan dihapus dari daftar anggota. Untuk menyimpan riwayat, ubah statusnya menjadi “Keluar” saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeTarget && removeMember.mutate(removeTarget)}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
