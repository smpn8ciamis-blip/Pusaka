import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, Loader2, Pencil, Plus, Search, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import { ekskulDb } from '@/hooks/useEkskul';

interface EkskulTypeRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface MemberRow {
  extracurricular_type_id: string;
  status: 'aktif' | 'nonaktif' | 'keluar';
}

interface CoachRow {
  extracurricular_type_id: string;
  full_name: string;
}

const NAME_MAX = 80;

export default function EkskulTypes() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EkskulTypeRow | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['ekskul-types-all'],
    queryFn: async (): Promise<EkskulTypeRow[]> => {
      const { data, error } = await ekskulDb
        .from('extracurricular_types')
        .select('id, name, description, is_active')
        .order('name');
      if (error) throw error;
      return (data ?? []) as EkskulTypeRow[];
    },
  });

  // Jumlah anggota aktif & nama pembina per ekskul (hanya informasi tambahan)
  const { data: members = [] } = useQuery({
    queryKey: ['ekskul-members', 'all-for-types'],
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await ekskulDb.rpc('get_ekskul_members', { _type_id: null });
      if (error) throw error;
      return (data ?? []) as MemberRow[];
    },
  });

  const { data: coaches = [] } = useQuery({
    queryKey: ['ekskul-coaches'],
    queryFn: async (): Promise<CoachRow[]> => {
      const { data, error } = await ekskulDb.rpc('get_ekskul_coaches');
      if (error) throw error;
      return (data ?? []) as CoachRow[];
    },
  });

  const activeMembers = useMemo(() => {
    const map = new Map<string, number>();
    members.forEach((m) => {
      if (m.status === 'aktif') map.set(m.extracurricular_type_id, (map.get(m.extracurricular_type_id) ?? 0) + 1);
    });
    return map;
  }, [members]);

  const coachNames = useMemo(() => {
    const map = new Map<string, string[]>();
    coaches.forEach((c) => map.set(c.extracurricular_type_id, [...(map.get(c.extracurricular_type_id) ?? []), c.full_name]));
    return map;
  }, [coaches]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return types;
    return types.filter((t) => `${t.name} ${t.description ?? ''}`.toLowerCase().includes(term));
  }, [types, search]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ekskul-types-all'] });
    queryClient.invalidateQueries({ queryKey: ['ekskul-accessible-types'] });
    queryClient.invalidateQueries({ queryKey: ['extracurricular-types'] });
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setActive(true);
    setFormOpen(true);
  };

  const openEdit = (t: EkskulTypeRow) => {
    setEditing(t);
    setName(t.name);
    setDescription(t.description ?? '');
    setActive(t.is_active);
    setFormOpen(true);
  };

  const trimmed = name.trim();
  const duplicate = useMemo(
    () => types.some((t) => t.id !== editing?.id && t.name.trim().toLowerCase() === trimmed.toLowerCase()),
    [types, editing, trimmed],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: trimmed, description: description.trim() || null, is_active: active };
      if (editing) {
        const { error } = await ekskulDb.from('extracurricular_types').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await ekskulDb.from('extracurricular_types').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refresh();
      toast.success(editing ? 'Jenis ekskul diperbarui' : 'Jenis ekskul ditambahkan');
      setFormOpen(false);
    },
    onError: () => toast.error('Gagal menyimpan jenis ekskul'),
  });

  const toggleActive = useMutation({
    mutationFn: async (t: EkskulTypeRow) => {
      const { error } = await ekskulDb.from('extracurricular_types').update({ is_active: !t.is_active }).eq('id', t.id);
      if (error) throw error;
      return !t.is_active;
    },
    onSuccess: (nowActive) => {
      refresh();
      toast.success(nowActive ? 'Ekskul diaktifkan' : 'Ekskul dinonaktifkan');
    },
    onError: () => toast.error('Gagal mengubah status'),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <ClipboardList className="h-6 w-6 text-primary" /> Jenis Ekstrakurikuler
            </h1>
            <p className="text-sm text-muted-foreground">
              Tambah dan atur daftar ekskul sekolah. Ekskul yang dinonaktifkan tidak muncul di pilihan jurnal dan anggota.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Tambah Ekskul
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cari ekskul..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : visible.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">
                {types.length === 0 ? 'Belum ada ekstrakurikuler. Klik “Tambah Ekskul” untuk memulai.' : 'Tidak ada ekskul yang cocok.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama ekskul</TableHead>
                      <TableHead>Pembina</TableHead>
                      <TableHead className="text-center">Anggota aktif</TableHead>
                      <TableHead className="text-center">Aktif</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((t) => {
                      const names = coachNames.get(t.id) ?? [];
                      return (
                        <TableRow key={t.id} className={t.is_active ? '' : 'opacity-60'}>
                          <TableCell className="font-medium">
                            {t.name}
                            {t.description && <p className="max-w-md truncate text-xs font-normal text-muted-foreground">{t.description}</p>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {names.length ? names.join(', ') : <span className="text-muted-foreground">Belum ditugaskan</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" />{activeMembers.get(t.id) ?? 0}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={t.is_active}
                              disabled={toggleActive.isPending}
                              onCheckedChange={() => toggleActive.mutate(t)}
                              aria-label={`Aktifkan ${t.name}`}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(t)} aria-label="Ubah"><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="outline" asChild className="ml-1">
                              <Link to="/ekskul-members">Anggota</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={formOpen} onOpenChange={(o) => !save.isPending && setFormOpen(o)}>
        <DialogContent className="flex max-h-[90dvh] max-w-md flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 px-6 pb-3 pr-12 pt-6">
            <DialogTitle>{editing ? 'Ubah Ekstrakurikuler' : 'Tambah Ekstrakurikuler'}</DialogTitle>
            <DialogDescription>Nama ini tampil di jurnal, daftar hadir, dan website sekolah.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 py-3">
            <div className="space-y-1.5">
              <Label>Nama ekskul *</Label>
              <Input
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Pramuka, Bola Voli, Paskibra"
                autoFocus
              />
              {duplicate && <p className="text-xs text-destructive">Ekskul dengan nama ini sudah ada.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opsional: jadwal latihan, tujuan, atau keterangan singkat" />
            </div>
            <label className="flex cursor-pointer items-center justify-between rounded-md border p-3 text-sm">
              <span>
                Ekskul aktif
                <span className="block text-xs text-muted-foreground">Nonaktifkan bila tidak lagi berjalan; data lama tetap tersimpan.</span>
              </span>
              <Switch checked={active} onCheckedChange={setActive} />
            </label>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:gap-0">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={save.isPending}>Batal</Button>
            <Button onClick={() => save.mutate()} disabled={!trimmed || duplicate || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Simpan Perubahan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
