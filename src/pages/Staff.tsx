import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Pencil, Trash2, KeyRound } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cleanPhoneNumber, isValidPhoneNumber } from '@/lib/phone';

interface StaffRow {
  id: string;
  user_id: string | null;
  full_name: string;
  staff_type: 'tata_usaha' | 'karyawan';
  position: string | null;
  nip: string | null;
  phone: string | null;
  email: string | null;
  fingerprint_pin: string | null;
  status: 'aktif' | 'nonaktif';
  notes: string | null;
}

const TYPE_LABEL: Record<string, string> = { tata_usaha: 'Tata Usaha', karyawan: 'Karyawan Lain' };

const emptyForm = {
  full_name: '', staff_type: 'karyawan', position: '', nip: '', phone: '', fingerprint_pin: '',
  status: 'aktif', notes: '', create_account: false, email: '', password: '',
};

async function readFnError(error: any, data: any): Promise<string> {
  let msg = error?.message || data?.error || 'Terjadi kesalahan';
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body?.error) msg = String(body.error);
    }
  } catch { /* abaikan */ }
  if (/already (been )?registered|email_exists/i.test(msg)) return 'Email sudah terdaftar. Gunakan email lain.';
  if (/invalid input value for enum/i.test(msg) || /Invalid role/i.test(msg)) return 'Peran "staf" belum tersedia. Jalankan migrasi role staf dan deploy ulang fungsi create-staff.';
  return msg;
}

function StaffPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleting, setDeleting] = useState<StaffRow | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff' as any).select('*').order('full_name');
      if (error) throw error;
      return (data ?? []) as unknown as StaffRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) =>
      (typeFilter === 'all' || s.staff_type === typeFilter) &&
      (!q || s.full_name.toLowerCase().includes(q) || (s.position ?? '').toLowerCase().includes(q) || (s.nip ?? '').includes(q))
    );
  }, [staff, search, typeFilter]);

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (s: StaffRow) => {
    setEditing(s);
    setForm({
      full_name: s.full_name, staff_type: s.staff_type, position: s.position ?? '', nip: s.nip ?? '',
      phone: s.phone ?? '', fingerprint_pin: s.fingerprint_pin ?? '', status: s.status, notes: s.notes ?? '',
      create_account: false, email: s.email ?? '', password: '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const name = form.full_name.trim();
    if (name.length < 3) return toast.error('Nama minimal 3 karakter');
    const phone = cleanPhoneNumber(form.phone);
    if (!isValidPhoneNumber(phone)) return toast.error('Nomor HP harus 9–15 digit');
    if (!editing && form.create_account) {
      if (!form.email.trim()) return toast.error('Email akun wajib diisi');
      if (form.password.length < 6) return toast.error('Password minimal 6 karakter');
    }
    setSaving(true);
    try {
      const payload: any = {
        full_name: name,
        staff_type: form.staff_type,
        position: form.position.trim() || null,
        nip: form.nip.trim() || null,
        phone: phone || null,
        fingerprint_pin: form.fingerprint_pin.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from('staff' as any).update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Data staf diperbarui');
      } else {
        if (form.create_account) {
          const { data, error } = await supabase.functions.invoke('create-staff', {
            body: { email: form.email.trim(), password: form.password, fullName: name, role: 'staf' },
          });
          if (error || data?.error) throw new Error(await readFnError(error, data));
          payload.user_id = data?.user?.id ?? null;
          payload.email = form.email.trim();
        }
        const { error } = await supabase.from('staff' as any).insert(payload);
        if (error) throw error;
        toast.success(form.create_account ? 'Staf & akun berhasil dibuat' : 'Staf ditambahkan');
      }
      qc.invalidateQueries({ queryKey: ['staff'] });
      setDialogOpen(false);
    } catch (e: any) {
      const m = String(e?.message ?? e);
      toast.error(/staff_fingerprint_pin_key/.test(m) ? 'PIN fingerprint sudah dipakai staf lain' : m);
    } finally {
      setSaving(false);
    }
  };

  const del = useMutation({
    mutationFn: async (s: StaffRow) => {
      const { error } = await supabase.from('staff' as any).delete().eq('id', s.id);
      if (error) throw error;
      if (s.user_id) {
        const { data, error: fnErr } = await supabase.functions.invoke('delete-user', { body: { userId: s.user_id } });
        if (fnErr || data?.error) throw new Error('Data staf terhapus, tetapi akun gagal dihapus: ' + (await readFnError(fnErr, data)));
      }
    },
    onSuccess: () => { toast.success('Staf dihapus'); qc.invalidateQueries({ queryKey: ['staff'] }); setDeleting(null); },
    onError: (e: any) => { toast.error(e.message); qc.invalidateQueries({ queryKey: ['staff'] }); setDeleting(null); },
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Data Staf</h1>
            <p className="text-sm text-muted-foreground">Tata usaha dan karyawan lain. Staf dapat diberi akun login, PIN fingerprint, serta ditugaskan piket dan surat tugas.</p>
          </div>
          <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />Tambah Staf</Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Cari nama, jabatan, atau NIP…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua jenis</SelectItem>
                  <SelectItem value="tata_usaha">Tata Usaha</SelectItem>
                  <SelectItem value="karyawan">Karyawan Lain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CardTitle className="pt-2 text-sm font-medium text-muted-foreground">{filtered.length} staf</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead><TableHead>Jenis</TableHead><TableHead>Jabatan</TableHead>
                  <TableHead>No. HP</TableHead><TableHead>PIN FP</TableHead><TableHead>Akun</TableHead>
                  <TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Memuat…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Belum ada data staf</TableCell></TableRow>
                ) : filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.full_name}{s.nip && <div className="text-xs text-muted-foreground">NIP {s.nip}</div>}</TableCell>
                    <TableCell>{TYPE_LABEL[s.staff_type]}</TableCell>
                    <TableCell>{s.position || '-'}</TableCell>
                    <TableCell>{s.phone || '-'}</TableCell>
                    <TableCell>{s.fingerprint_pin || '-'}</TableCell>
                    <TableCell>{s.user_id ? <Badge variant="secondary"><KeyRound className="mr-1 h-3 w-3" />Ada</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell><Badge variant={s.status === 'aktif' ? 'default' : 'outline'}>{s.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Ubah Data Staf' : 'Tambah Staf'}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nama lengkap *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Jenis staf</Label>
                <Select value={form.staff_type} onValueChange={(v) => setForm({ ...form, staff_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tata_usaha">Tata Usaha</SelectItem>
                    <SelectItem value="karyawan">Karyawan Lain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Jabatan</Label><Input placeholder="Operator, Satpam, …" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>NIP / NIK</Label><Input value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} /></div>
              <div><Label>No. HP / WA</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>PIN fingerprint</Label><Input value={form.fingerprint_pin} onChange={(e) => setForm({ ...form, fingerprint_pin: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktif">Aktif</SelectItem>
                    <SelectItem value="nonaktif">Nonaktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Catatan</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

            {!editing && (
              <div className="space-y-3 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={form.create_account} onChange={(e) => setForm({ ...form, create_account: e.target.checked })} />
                  Buatkan akun login untuk staf ini
                </label>
                {form.create_account && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                    <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus staf?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.full_name} akan dihapus{deleting?.user_id ? ' beserta akun loginnya' : ''}. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && del.mutate(deleting)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

export default function Staff() {
  return <ProtectedRoute allowedRoles={['admin', 'super_admin']}><StaffPage /></ProtectedRoute>;
}
