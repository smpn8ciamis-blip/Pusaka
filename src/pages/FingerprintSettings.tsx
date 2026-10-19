import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Fingerprint, Wand2, Download } from 'lucide-react';
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
import * as XLSX from 'xlsx';

// Tabel fingerprint belum ada di types.ts yang digenerate, jadi pakai klien tanpa tipe.
const db = supabase as any;

const RESULT_LABEL: Record<string, string> = {
  check_in: 'Masuk', late: 'Terlambat', check_out: 'Pulang', already: 'Sudah tercatat', staff: 'Staf (dipakai piket)',
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
function PersonPinList({ kind }: { kind: 'students' | 'teachers' | 'staff' }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [confirmAll, setConfirmAll] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fp-map', kind, q, onlyEmpty, page, pageSize],
    queryFn: async () => {
      const { data, error } = await db.rpc('fp_list_people', {
        p_kind: kind, p_q: q.trim() || null, p_only_empty: onlyEmpty, p_limit: pageSize, p_offset: (page - 1) * pageSize,
      });
      if (error) throw error;
      const rows = (data || []) as any[];
      return { rows, total: rows.length ? Number(rows[0].total) : 0 };
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
          placeholder={kind === 'students' ? 'Cari nama siswa aktif…' : kind === 'staff' ? 'Cari nama staf aktif…' : 'Cari nama guru…'}
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
                {kind !== 'teachers' && <TableHead>{kind === 'staff' ? 'Jenis' : 'Kelas'}</TableHead>}
                <TableHead className="w-44">PIN mesin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Tidak ada data.</TableCell></TableRow>
              )}
              {rows.map((p) => (
                <TableRow key={`${p.id}-${p.fingerprint_pin ?? ''}`}>
                  <TableCell>{p.full_name || '-'}</TableCell>
                  {kind !== 'teachers' && <TableCell>{p.class_name || '-'}</TableCell>}
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
            <AlertDialogTitle>Generate PIN untuk semua {kind === 'students' ? 'siswa aktif (bukan alumni/mutasi)' : 'guru'} yang belum punya PIN?</AlertDialogTitle>
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

async function fetchAllPeople(kind: 'students' | 'teachers') {
  const all: any[] = [];
  const size = 1000;
  for (let off = 0; ; off += size) {
    const { data, error } = await db.rpc('fp_list_people', { p_kind: kind, p_q: null, p_only_empty: false, p_limit: size, p_offset: off });
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return all;
}

/* -------------------- Kirim pengguna ke mesin (ADMS) -------------------- */
// Nama di mesin: ASCII sederhana, maks 24 karakter (batas umum mesin ZKTeco).
const machineName = (n: string) =>
  (n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').replace(/[\t=&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
const userInfoCmd = (pin: string, name: string) =>
  `DATA UPDATE USERINFO PIN=${pin}\tName=${machineName(name)}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000000000000`;

function SendUsersTab() {
  const qc = useQueryClient();
  const [sn, setSn] = useState('');
  const [groups, setGroups] = useState({ teachers: true, staff: true, students: false });
  const [trial, setTrial] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: devices = [] } = useQuery({
    queryKey: ['fp-devices'],
    queryFn: async () => {
      const { data, error } = await db.from('fingerprint_devices').select('*').order('created_at');
      if (error) throw error;
      return data as any[];
    },
  });
  const activeDevices = devices.filter((d) => d.is_active);
  const device = sn || activeDevices[0]?.serial_number || '';

  const { data: people, isLoading } = useQuery({
    queryKey: ['fp-send-people'],
    queryFn: async () => {
      const [students, teachers, staffRes] = await Promise.all([
        fetchAllPeople('students'), fetchAllPeople('teachers'),
        db.from('staff').select('full_name, fingerprint_pin, status'),
      ]);
      const withPin = (a: any[]) => a.filter((p) => p.fingerprint_pin).map((p) => ({ name: p.full_name || '', pin: String(p.fingerprint_pin) }));
      return {
        students: withPin(students), teachers: withPin(teachers),
        staff: ((staffRes.data as any[]) || []).filter((x) => x.status !== 'nonaktif' && x.fingerprint_pin)
          .map((x) => ({ name: x.full_name as string, pin: String(x.fingerprint_pin) })),
        studentTotal: students.length, teacherTotal: teachers.length,
      };
    },
  });

  const { data: queue = [], refetch: refetchQueue } = useQuery({
    queryKey: ['fp-commands', device],
    enabled: !!device,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await db.from('fingerprint_commands').select('id, label, status, return_code').eq('device_sn', device).order('id', { ascending: false }).limit(5000);
      if (error) throw error;
      return data as any[];
    },
  });
  const count = (st: string) => queue.filter((c) => c.status === st).length;
  const failed = queue.filter((c) => c.status === 'failed').slice(0, 10);

  const selected = [
    ...(groups.teachers ? people?.teachers ?? [] : []),
    ...(groups.staff ? people?.staff ?? [] : []),
    ...(groups.students ? people?.students ?? [] : []),
  ];
  const toSend = trial ? selected.slice(0, 3) : selected;

  const send = async () => {
    setSending(true);
    try {
      const rows = toSend.map((p) => ({ device_sn: device, command: userInfoCmd(p.pin, p.name), label: p.name }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from('fingerprint_commands').insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      toast.success(`${rows.length} pengguna masuk antrean. Mesin mengambilnya otomatis dalam ±30 detik.`);
      setConfirm(false);
      await refetchQueue();
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengisi antrean');
    } finally {
      setSending(false);
    }
  };

  const retry = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('fingerprint_commands').update({ status: 'pending', return_code: null, sent_at: null }).eq('device_sn', device).in('status', ['failed', 'sent']);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Perintah gagal/menggantung dikirim ulang'); qc.invalidateQueries({ queryKey: ['fp-commands', device] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const clearDone = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('fingerprint_commands').delete().eq('device_sn', device).in('status', ['done', 'failed']);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Riwayat dibersihkan'); qc.invalidateQueries({ queryKey: ['fp-commands', device] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const groupRow = (key: 'teachers' | 'staff' | 'students', label: string, n: number, total?: number) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={groups[key]} onChange={(e) => setGroups({ ...groups, [key]: e.target.checked })} />
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">{n} punya PIN{total != null ? ` dari ${total}` : ''}</span>
    </label>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kirim pengguna ke mesin</CardTitle>
          <CardDescription>
            Mengirim PIN dan nama ke mesin sekaligus, jadi tidak perlu mengetik satu per satu. Sidik jari / wajah tetap direkam di mesin oleh orangnya:
            pilih nama lalu rekam. Hanya orang yang sudah punya PIN yang dikirim (isi PIN di tab Pemetaan PIN).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeDevices.length === 0 ? (
            <p className="text-sm text-amber-600">Belum ada mesin aktif. Aktifkan mesin di tab Mesin terlebih dahulu.</p>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span>Mesin</span>
              <select className="rounded-md border bg-background px-2 py-1" value={device} onChange={(e) => setSn(e.target.value)}>
                {activeDevices.map((d) => <option key={d.serial_number} value={d.serial_number}>{d.name || d.serial_number} ({d.serial_number})</option>)}
              </select>
            </div>
          )}
          {isLoading ? <p className="text-sm text-muted-foreground">Memuat data…</p> : (
            <div className="space-y-1">
              {groupRow('teachers', 'Guru', people?.teachers.length ?? 0, people?.teacherTotal)}
              {groupRow('staff', 'Staf', people?.staff.length ?? 0)}
              {groupRow('students', 'Siswa aktif', people?.students.length ?? 0, people?.studentTotal)}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} />
            Uji coba: kirim hanya 3 orang pertama (matikan setelah berhasil)
          </label>
          <Button disabled={!device || toSend.length === 0} onClick={() => setConfirm(true)}>
            Kirim {toSend.length} pengguna ke mesin
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Antrean perintah</CardTitle>
          <CardDescription>Menunggu mesin mengambil (±30 detik) · diperbarui otomatis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">Menunggu {count('pending')}</Badge>
            <Badge variant="outline">Terkirim, belum dikonfirmasi {count('sent')}</Badge>
            <Badge>Berhasil {count('done')}</Badge>
            <Badge variant="destructive">Gagal {count('failed')}</Badge>
          </div>
          {failed.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Gagal: {failed.map((c) => `${c.label ?? '?'} (kode ${c.return_code})`).join(', ')}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchQueue()}>Muat ulang</Button>
            <Button variant="outline" size="sm" onClick={() => retry.mutate()} disabled={count('failed') + count('sent') === 0}>Kirim ulang gagal / menggantung</Button>
            <Button variant="outline" size="sm" onClick={() => clearDone.mutate()} disabled={count('done') + count('failed') === 0}>Bersihkan riwayat</Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kirim {toSend.length} pengguna ke mesin?</AlertDialogTitle>
            <AlertDialogDescription>
              PIN yang sudah ada di mesin akan diperbarui namanya; sidik jari/wajah yang sudah direkam tidak dihapus.
              {trial ? ' Mode uji coba aktif (3 orang).' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={send} disabled={sending}>Kirim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------- Rekam sidik jari / wajah dari komputer (ADMS ENROLL) ------------- */
const FINGERS = [
  { fid: 6, label: 'Telunjuk kanan' }, { fid: 3, label: 'Telunjuk kiri' },
  { fid: 5, label: 'Jempol kanan' }, { fid: 4, label: 'Jempol kiri' },
  { fid: 7, label: 'Jari tengah kanan' }, { fid: 2, label: 'Jari tengah kiri' },
];
// Sintaks mengikuti protokol Push ZKTeco; bisa berbeda antar firmware, jadi dapat diedit dan dilihat kode hasilnya.
const DEFAULT_FACE_TEMPLATE = 'ENROLL_BIO PIN={PIN}\tTYPE=9\tNO=0\tRETRY=3\tOVERWRITE=1';
const fpCmd = (pin: string, fid: number) => `ENROLL_FP PIN=${pin}\tFID=${fid}\tRETRY=3\tOVERWRITE=1`;

function EnrollTab() {
  const qc = useQueryClient();
  const [sn, setSn] = useState('');
  const [q, setQ] = useState('');
  const [fid, setFid] = useState(6);
  const [facePin, setFacePin] = useState('');
  const [faceTpl, setFaceTpl] = useState(() => {
    try { return localStorage.getItem('fp-face-template') || DEFAULT_FACE_TEMPLATE; } catch { return DEFAULT_FACE_TEMPLATE; }
  });
  const saveTpl = (v: string) => {
    setFaceTpl(v);
    try { localStorage.setItem('fp-face-template', v); } catch { /* abaikan */ }
  };

  const { data: devices = [] } = useQuery({
    queryKey: ['fp-devices'],
    queryFn: async () => {
      const { data, error } = await db.from('fingerprint_devices').select('*').order('created_at');
      if (error) throw error;
      return data as any[];
    },
  });
  const activeDevices = devices.filter((d) => d.is_active);
  const device = sn || activeDevices[0]?.serial_number || '';

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['fp-enroll-people'],
    queryFn: async () => {
      const [students, teachers, staffRes] = await Promise.all([
        fetchAllPeople('students'), fetchAllPeople('teachers'), db.from('staff').select('full_name, fingerprint_pin, status, staff_type'),
      ]);
      const mk = (a: any[], kind: string) => a.filter((p) => p.fingerprint_pin)
        .map((p) => ({ name: (p.full_name || '') as string, pin: String(p.fingerprint_pin), kind, extra: (p.class_name || '') as string }));
      return [
        ...mk(teachers, 'Guru'),
        ...mk(((staffRes.data as any[]) || []).filter((x) => x.status !== 'nonaktif'), 'Staf'),
        ...mk(students, 'Siswa'),
      ];
    },
  });

  const { data: methods = new Map<string, { finger: number; face: number }>() } = useQuery({
    queryKey: ['fp-pin-methods'],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.rpc('fp_pin_methods');
      if (error) return new Map<string, { finger: number; face: number }>();
      return new Map<string, { finger: number; face: number }>(
        ((data as any[]) || []).map((r) => [String(r.pin), { finger: Number(r.finger_count), face: Number(r.face_count) }]),
      );
    },
  });
  const [onlyNoFace, setOnlyNoFace] = useState(false);

  const { data: queue = [], refetch } = useQuery({
    queryKey: ['fp-enroll-queue', device],
    enabled: !!device,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await db.from('fingerprint_commands').select('id, label, status, return_code, created_at')
        .eq('device_sn', device).like('command', 'ENROLL_%').order('id', { ascending: false }).limit(15);
      if (error) throw error;
      return data as any[];
    },
  });

  const enqueue = useMutation({
    mutationFn: async ({ pin, name, mode }: { pin: string; name: string; mode: 'jari' | 'wajah' }) => {
      const command = mode === 'jari' ? fpCmd(pin, fid) : faceTpl.replace('{PIN}', pin);
      const { error } = await db.from('fingerprint_commands').insert({
        device_sn: device, command, label: `${mode === 'jari' ? 'Rekam jari' : 'Rekam wajah'}: ${name}`,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(`Perintah rekam ${v.mode} untuk ${v.name} terkirim ke antrean. Layar rekam muncul di mesin dalam beberapa detik.`);
      qc.invalidateQueries({ queryKey: ['fp-enroll-queue', device] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('fingerprint_commands').delete().eq('device_sn', device).eq('status', 'pending').like('command', 'ENROLL_%');
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Antrean rekam yang menunggu dibatalkan'); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = q.trim().toLowerCase();
  const shown = people.filter((p) => (!onlyNoFace || !(methods.get(p.pin)?.face)) && (!term || p.name.toLowerCase().includes(term) || p.pin.includes(term) || p.extra.toLowerCase().includes(term))).slice(0, 50);
  const noFaceCount = people.filter((p) => !methods.get(p.pin)?.face).length;
  const statusLabel: Record<string, string> = { pending: 'Menunggu mesin', sent: 'Layar rekam dibuka di mesin', done: 'Selesai', failed: 'Gagal' };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rekam sidik jari / wajah dari komputer</CardTitle>
          <CardDescription>
            Klik <b>Rekam jari</b> pada nama: layar rekam sidik jari terbuka di mesin untuk PIN itu (bisa tertunda sesuai interval ping mesin, biasanya beberapa detik hingga ±1 menit). Orang harus sudah ada di mesin (kirim dulu di tab Kirim ke Mesin). Perintah dikirim satu per satu. Rekam wajah pada mesin tipe ini (Face VX7.0, firmware 8.0.3.6) dilakukan langsung di mesin; tombol <b>Panduan wajah</b> menampilkan langkahnya.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeDevices.length === 0 ? (
            <p className="text-sm text-amber-600">Belum ada mesin aktif. Aktifkan mesin di tab Mesin terlebih dahulu.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>Mesin</span>
              <select className="rounded-md border bg-background px-2 py-1" value={device} onChange={(e) => setSn(e.target.value)}>
                {activeDevices.map((d) => <option key={d.serial_number} value={d.serial_number}>{d.name || d.serial_number}</option>)}
              </select>
              <span>Jari</span>
              <select className="rounded-md border bg-background px-2 py-1" value={fid} onChange={(e) => setFid(Number(e.target.value))}>
                {FINGERS.map((f) => <option key={f.fid} value={f.fid}>{f.label}</option>)}
              </select>
            </div>
          )}
          <Input placeholder="Cari nama, kelas, atau PIN…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyNoFace} onChange={(e) => setOnlyNoFace(e.target.checked)} />
            Tampilkan yang belum terdeteksi absen wajah ({noFaceCount} orang)
          </label>
          <p className="text-xs text-muted-foreground">Status diambil dari riwayat absen: "Wajah terdeteksi" berarti orang itu pernah absen memakai wajah di mesin. Yang sudah merekam wajah tetapi belum pernah absen dengan wajah akan tampil "Belum ada absen wajah".</p>
          {isLoading ? <p className="text-sm text-muted-foreground">Memuat…</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>PIN</TableHead><TableHead className="text-right">Rekam</TableHead></TableRow></TableHeader>
              <TableBody>
                {shown.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Tidak ada data (hanya yang punya PIN yang tampil).</TableCell></TableRow>
                ) : shown.map((p) => (
                  <TableRow key={p.kind + p.pin}>
                    <TableCell className="font-medium">{p.name}<div className="text-xs text-muted-foreground">{p.kind}{p.extra ? ` · ${p.extra}` : ''}</div>
                      <div className="mt-1 flex gap-1">
                        <Badge variant={methods.get(p.pin)?.finger ? 'default' : 'outline'} className="font-normal">{methods.get(p.pin)?.finger ? 'Jari terdeteksi' : 'Belum ada absen jari'}</Badge>
                        <Badge variant={methods.get(p.pin)?.face ? 'default' : 'outline'} className="font-normal">{methods.get(p.pin)?.face ? 'Wajah terdeteksi' : 'Belum ada absen wajah'}</Badge>
                      </div></TableCell>
                    <TableCell>{p.pin}</TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap text-right">
                      <Button size="sm" variant="outline" disabled={!device || enqueue.isPending} onClick={() => enqueue.mutate({ pin: p.pin, name: p.name, mode: 'jari' })}>Rekam jari</Button>
                      <Button size="sm" variant="ghost" onClick={() => toast.info(`Wajah ${p.name} (PIN ${p.pin}): rekam langsung di mesin. Menu → Pengguna → Kelola Pengguna → cari PIN ${p.pin} → Edit → Wajah.`, { duration: 12000 })}>Panduan wajah</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {people.length > 50 && <p className="text-xs text-muted-foreground">Menampilkan 50 teratas; gunakan pencarian.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Antrean rekam</CardTitle>
          <CardDescription>Diperbarui otomatis. Kode gagal ≠ 0 berarti mesin menolak perintah.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {queue.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada perintah rekam.</p> : queue.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span>{c.label}</span>
              <Badge variant={c.status === 'failed' ? 'destructive' : c.status === 'done' ? 'default' : 'outline'}>
                {statusLabel[c.status] ?? c.status}{c.status === 'failed' ? ` (kode ${c.return_code})` : ''}
              </Badge>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => cancel.mutate()} disabled={!queue.some((c) => c.status === 'pending')}>Batalkan yang menunggu</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Eksperimental: perintah rekam wajah jarak jauh</CardTitle>
          <CardDescription>
            Firmware lama (Push 2.0.x) umumnya tidak mendukung rekam wajah jarak jauh (kode -1003). Hanya untuk mesin/firmware lebih baru; <code>{'{PIN}'}</code> diganti PIN orangnya.
          </CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input className="w-32" placeholder="PIN" value={facePin} onChange={(e) => setFacePin(e.target.value)} />
            <Button variant="outline" size="sm" disabled={!device || !facePin.trim() || enqueue.isPending} onClick={() => enqueue.mutate({ pin: facePin.trim(), name: `PIN ${facePin.trim()}`, mode: 'wajah' })}>Coba kirim</Button>
          </div>
          <Input className="font-mono text-xs" value={faceTpl.replace(/\t/g, '<TAB>')} onChange={(e) => saveTpl(e.target.value.replace(/<TAB>/g, '\t'))} />
          <Button variant="ghost" size="sm" onClick={() => saveTpl(DEFAULT_FACE_TEMPLATE)}>Kembalikan bawaan</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MappingTab() {
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true);
    try {
      const [students, teachers, staffRes] = await Promise.all([fetchAllPeople('students'), fetchAllPeople('teachers'),
        db.from('staff').select('full_name, nip, staff_type, fingerprint_pin, status').order('full_name')]);
      const staff = ((staffRes.data as any[]) || []).filter((x) => x.status !== 'nonaktif');
      const wb = XLSX.utils.book_new();
      const sSheet = XLSX.utils.json_to_sheet(students.map((p, i) => ({
        No: i + 1, Nama: p.full_name, Kelas: p.class_name || '', NIS: p.nis || '', NISN: p.nisn || '', PIN: p.fingerprint_pin || '',
      })), { header: ['No', 'Nama', 'Kelas', 'NIS', 'NISN', 'PIN'] });
      sSheet['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
      const tSheet = XLSX.utils.json_to_sheet(teachers.map((p, i) => ({
        No: i + 1, Nama: p.full_name || '', NIP: p.nip || '', PIN: p.fingerprint_pin || '',
      })), { header: ['No', 'Nama', 'NIP', 'PIN'] });
      tSheet['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 22 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, sSheet, 'Siswa');
      const stSheet = XLSX.utils.json_to_sheet(staff.map((p, i) => ({
        No: i + 1, Nama: p.full_name || '', Jenis: p.staff_type === 'tata_usaha' ? 'Tata Usaha' : 'Karyawan', NIP: p.nip || '', PIN: p.fingerprint_pin || '',
      })), { header: ['No', 'Nama', 'Jenis', 'NIP', 'PIN'] });
      stSheet['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 14 }, { wch: 22 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, tSheet, 'Guru');
      XLSX.utils.book_append_sheet(wb, stSheet, 'Staf');
      const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      XLSX.writeFile(wb, `PIN-Fingerprint-${stamp}.xlsx`);
      toast.success(`Export selesai: ${students.length} siswa aktif, ${teachers.length} guru, ${staff.length} staf`);
    } catch (e: any) {
      toast.error(e.message || 'Gagal export');
    } finally {
      setExporting(false);
    }
  };
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
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
          Export PIN ke Excel (siswa aktif + guru + staf)
        </Button>
      </div>
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
        <TabsList><TabsTrigger value="students">Siswa</TabsTrigger><TabsTrigger value="teachers">Guru</TabsTrigger><TabsTrigger value="staff">Staf</TabsTrigger></TabsList>
        <TabsContent value="students"><PersonPinList kind="students" /></TabsContent>
        <TabsContent value="teachers"><PersonPinList kind="teachers" /></TabsContent>
        <TabsContent value="staff"><PersonPinList kind="staff" /></TabsContent>
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
      const { data, error } = await db.from('teacher_presence').select('*, teachers(profiles(full_name))').eq('date', date).order('check_in_at');
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
                  <TableCell>{r.teachers?.profiles?.full_name || '-'}</TableCell>
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
            <TabsTrigger value="send">Kirim ke Mesin</TabsTrigger>
            <TabsTrigger value="enroll">Rekam Jari / Wajah</TabsTrigger>
            <TabsTrigger value="logs">Log</TabsTrigger>
            <TabsTrigger value="teachers">Kehadiran Guru</TabsTrigger>
          </TabsList>
          <TabsContent value="devices"><DevicesTab /></TabsContent>
          <TabsContent value="mapping"><MappingTab /></TabsContent>
          <TabsContent value="send"><SendUsersTab /></TabsContent>
          <TabsContent value="enroll"><EnrollTab /></TabsContent>
          <TabsContent value="logs"><LogsTab /></TabsContent>
          <TabsContent value="teachers"><TeacherPresenceTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
