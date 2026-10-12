import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Fingerprint, Wand2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { waAdminFetch } from '@/lib/waBot';

// Tabel fingerprint belum ada di types.ts yang digenerate, jadi pakai klien tanpa tipe.
const db = supabase as any;

const RESULT_LABEL: Record<string, string> = {
  check_in: 'Masuk', late: 'Terlambat', check_out: 'Pulang', already: 'Sudah tercatat',
  unmapped: 'PIN belum dipetakan', outside_hours: 'Di luar jam', duplicate: 'Duplikat',
};
const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-';
const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }) : '-';

/* ------------------------------ Mesin ------------------------------ */
function DevicesTab() {
  const qc = useQueryClient();
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['fp-devices'],
    queryFn: async () => {
      const { data, error } = await db.from('fingerprint_devices').select('*').order('created_at');
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 15000,
  });
  const toggle = useMutation({
    mutationFn: async ({ sn, active }: { sn: string; active: boolean }) => {
      const { error } = await db.from('fingerprint_devices').update({ is_active: active }).eq('serial_number', sn);
      if (error) throw error;
      await waAdminFetch('/admin/fingerprint/reload', { method: 'POST' }).catch(() => undefined);
    },
    onSuccess: () => { toast.success('Status mesin diperbarui'); qc.invalidateQueries({ queryKey: ['fp-devices'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rename = useMutation({
    mutationFn: async ({ sn, name }: { sn: string; name: string }) => {
      const { error } = await db.from('fingerprint_devices').update({ name }).eq('serial_number', sn);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp-devices'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cara menghubungkan mesin</CardTitle>
          <CardDescription>Mesin ZKTeco / Solution (mis. X609) mengirim data otomatis ke server (protokol ADMS).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal pl-5 space-y-1">
            <li>Di mesin: <b>Menu → Comm. → Cloud Server Setting</b> (atau ADMS).</li>
            <li>Isi <b>Server Address</b> = <code>{host || 'domain-server-bot'}</code> (atau IP server), <b>Port</b> = port HTTP bot (mis. 3000), <b>HTTPS</b> = mati.</li>
            <li>Pastikan mesin sudah tersambung LAN/WiFi dan bisa internet. Dalam ±1 menit mesin muncul di daftar di bawah dengan status <b>Menunggu</b>.</li>
            <li>Aktifkan mesin di sini, lalu petakan PIN pengguna di tab <b>Pemetaan PIN</b>.</li>
          </ol>
          <p className="text-muted-foreground">Data yang dikirim saat mesin belum diaktifkan tidak hilang: mesin menyimpannya dan mengirim ulang setelah diaktifkan.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Daftar mesin</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada mesin yang menghubungi server.</p>
          ) : (
            <div className="space-y-3">
              {devices.map((d) => {
                const online = d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 3 * 60 * 1000;
                return (
                  <div key={d.serial_number} className="flex flex-wrap items-center gap-3 border rounded-md p-3">
                    <Fingerprint className="h-5 w-5 text-muted-foreground" />
                    <div className="min-w-[160px] flex-1">
                      <Input
                        defaultValue={d.name || ''}
                        className="h-8"
                        onBlur={(e) => e.target.value !== (d.name || '') && rename.mutate({ sn: d.serial_number, name: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-1">SN: {d.serial_number} · IP: {d.last_ip || '-'} · terakhir: {fmt(d.last_seen_at)}</p>
                    </div>
                    <Badge variant={online ? 'default' : 'secondary'}>{online ? 'Online' : 'Offline'}</Badge>
                    <Badge variant={d.is_active ? 'default' : 'outline'}>{d.is_active ? 'Aktif' : 'Menunggu'}</Badge>
                    <Switch checked={!!d.is_active} onCheckedChange={(v) => toggle.mutate({ sn: d.serial_number, active: v })} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------ Pemetaan PIN ------------------------------ */
function PersonPinList({ kind }: { kind: 'students' | 'teachers' }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [confirmAll, setConfirmAll] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fp-map', kind, q, onlyEmpty, page, pageSize],
    queryFn: async () => {
      let query = kind === 'students'
        ? db.from('students').select('id, full_name, fingerprint_pin, classes(name)', { count: 'exact' }).eq('status', 'aktif')
        : db.from('teachers').select('id, full_name, fingerprint_pin', { count: 'exact' });
      if (q.trim()) query = query.ilike('full_name', `%${q.trim()}%`);
      if (onlyEmpty) query = query.is('fingerprint_pin', null);
      const from = (page - 1) * pageSize;
      const { data, error, count } = await query.order('full_name').range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: data as any[], total: (count as number) || 0 };
    },
    placeholderData: (prev: any) => prev,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const refresh = () => { qc.invalidateQueries({ queryKey: ['fp-map', kind] }); };
  const save = useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string }) => {
      const { error } = await db.from(kind).update({ fingerprint_pin: pin.trim() || null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('PIN disimpan'); refresh(); },
    onError: (e: Error) => toast.error(e.message.includes('duplicate') ? 'PIN sudah dipakai orang lain' : e.message),
  });
  const generate = useMutation({
    mutationFn: async (ids: string[] | null) => {
      const { data, error } = await db.rpc('fp_generate_pins', { p_kind: kind, p_ids: ids });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(n > 0 ? `${n} PIN berhasil dibuat` : 'Tidak ada PIN baru yang perlu dibuat'); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          className="max-w-xs"
          placeholder={kind === 'students' ? 'Cari nama siswa…' : 'Cari nama guru…'}
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyEmpty} onCheckedChange={(v) => { setOnlyEmpty(v); setPage(1); }} /> Belum punya PIN
        </label>
        <Button className="ml-auto" size="sm" onClick={() => setConfirmAll(true)} disabled={generate.isPending}>
          {generate.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
          Generate PIN semua yang kosong
        </Button>
      </div>

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                {kind === 'students' && <TableHead>Kelas</TableHead>}
                <TableHead className="w-44">PIN mesin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Tidak ada data.</TableCell></TableRow>
              )}
              {rows.map((p) => (
                <TableRow key={`${p.id}-${p.fingerprint_pin ?? ''}`}>
                  <TableCell>{p.full_name}</TableCell>
                  {kind === 'students' && <TableCell>{p.classes?.name || '-'}</TableCell>}
                  <TableCell>
                    <div className="flex gap-1">
                      <Input
                        defaultValue={p.fingerprint_pin || ''}
                        inputMode="numeric"
                        className="h-8"
                        placeholder="PIN"
                        onBlur={(e) => e.target.value.trim() !== (p.fingerprint_pin || '') && save.mutate({ id: p.id, pin: e.target.value })}
                      />
                      {!p.fingerprint_pin && (
                        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" title="Generate PIN" disabled={generate.isPending}
                          onClick={() => generate.mutate([p.id])}>
                          <Wand2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm">
            <span className="text-muted-foreground">
              {total === 0 ? '0 data' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total}`}
            </span>
            <div className="flex items-center gap-2">
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / halaman</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>Sebelumnya</Button>
              <span>Hal. {page} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((x) => x + 1)}>Berikutnya</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        PIN = nomor ID yang didaftarkan di mesin. Ketik PIN lalu klik di luar kolom untuk menyimpan, atau klik ikon tongkat untuk membuat PIN otomatis
        (angka urut, tidak kembar antara siswa dan guru). Yang sudah punya PIN tidak diubah.
      </p>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate PIN untuk semua {kind === 'students' ? 'siswa aktif' : 'guru'} yang belum punya PIN?</AlertDialogTitle>
            <AlertDialogDescription>
              PIN dibuat berurutan (urut kelas lalu nama untuk siswa). Setelah itu daftarkan PIN yang sama di mesin saat enroll jari.
              PIN yang sudah ada tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => generate.mutate(null)}>Generate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MappingTab() {
  const { data: unmapped = [] } = useQuery({
    queryKey: ['fp-unmapped'],
    queryFn: async () => {
      const { data } = await db.from('fingerprint_logs').select('pin, punched_at').eq('result', 'unmapped').order('punched_at', { ascending: false }).limit(200);
      const seen = new Map<string, string>();
      (data || []).forEach((r: any) => { if (!seen.has(r.pin)) seen.set(r.pin, r.punched_at); });
      return Array.from(seen.entries());
    },
    refetchInterval: 20000,
  });
  return (
    <div className="space-y-4">
      {unmapped.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">PIN yang sudah menempel jari tapi belum dipetakan</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {unmapped.map(([pin, at]) => (
              <Badge key={pin} variant="outline" title={fmt(at)}>PIN {pin} · {fmtTime(at)}</Badge>
            ))}
          </CardContent>
        </Card>
      )}
      <Tabs defaultValue="students">
        <TabsList><TabsTrigger value="students">Siswa</TabsTrigger><TabsTrigger value="teachers">Guru</TabsTrigger></TabsList>
        <TabsContent value="students"><PersonPinList kind="students" /></TabsContent>
        <TabsContent value="teachers"><PersonPinList kind="teachers" /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------ Log & kehadiran guru ------------------------------ */
function LogsTab() {
  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['fp-logs'],
    queryFn: async () => {
      const { data, error } = await db.from('fingerprint_logs').select('*').order('punched_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 15000,
  });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>100 ketukan terakhir</CardTitle>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Muat ulang</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>PIN</TableHead><TableHead>Jenis</TableHead><TableHead>Hasil</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{fmt(l.punched_at)}</TableCell>
                  <TableCell>{l.pin}</TableCell>
                  <TableCell>{l.person_type === 'student' ? 'Siswa' : l.person_type === 'teacher' ? 'Guru' : '-'}</TableCell>
                  <TableCell>{RESULT_LABEL[l.result] || l.result || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function TeacherPresenceTab() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const [date, setDate] = useState(today);
  const { data = [], isLoading } = useQuery({
    queryKey: ['fp-presence', date],
    queryFn: async () => {
      const { data, error } = await db.from('teacher_presence').select('*, teachers(full_name)').eq('date', date).order('check_in_at');
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 30000,
  });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Kehadiran guru</CardTitle>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada guru yang absen pada tanggal ini.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Datang</TableHead><TableHead>Pulang</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.teachers?.full_name || '-'}</TableCell>
                  <TableCell>{fmtTime(r.check_in_at)}</TableCell>
                  <TableCell>{fmtTime(r.check_out_at)}</TableCell>
                  <TableCell><Badge variant={r.status === 'terlambat' ? 'destructive' : 'default'}>{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function FingerprintSettings() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Fingerprint className="h-6 w-6" /> Mesin Fingerprint</h1>
          <p className="text-sm text-muted-foreground">
            Absen siswa masuk ke absensi RFID (masuk/pulang), absen guru masuk ke kehadiran guru. Jam siswa mengikuti pengaturan absensi RFID.
          </p>
        </div>
        <Tabs defaultValue="devices">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="devices">Mesin</TabsTrigger>
            <TabsTrigger value="mapping">Pemetaan PIN</TabsTrigger>
            <TabsTrigger value="logs">Log</TabsTrigger>
            <TabsTrigger value="teachers">Kehadiran Guru</TabsTrigger>
          </TabsList>
          <TabsContent value="devices"><DevicesTab /></TabsContent>
          <TabsContent value="mapping"><MappingTab /></TabsContent>
          <TabsContent value="logs"><LogsTab /></TabsContent>
          <TabsContent value="teachers"><TeacherPresenceTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
