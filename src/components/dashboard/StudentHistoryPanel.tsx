import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { CalendarClock, FileSpreadsheet, Loader2, Save, Trash2 } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { periodLabel, periodShort, snapDb, useStudentSnapshots, type StudentSnapshot } from '@/hooks/useStudentSnapshots';

type View = 'rombel' | 'tingkat' | 'tren';

interface Row { key: string; label: string; male: number; female: number; total: number; delta: number | null; isNew: boolean }

const DeltaBadge = ({ d, isNew }: { d: number | null; isNew?: boolean }) => {
  if (isNew) return <span className="text-[11px] font-semibold text-sky-600">baru</span>;
  if (d === null) return <span className="text-[11px] text-muted-foreground">-</span>;
  if (d === 0) return <span className="text-[11px] text-muted-foreground">0</span>;
  return <span className={`text-[11px] font-semibold tabular-nums ${d > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{d > 0 ? `+${d}` : d}</span>;
};

/** Riwayat jumlah siswa per rombel / tingkat pada akhir tiap bulan. */
export function StudentHistoryPanel() {
  const { userRole } = useAuth();
  const { selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();
  const canCapture = userRole === 'admin' || userRole === 'super_admin' || userRole === 'kesiswaan';
  const canDelete = userRole === 'admin' || userRole === 'super_admin';
  const { data: snaps = [], isLoading } = useStudentSnapshots(selectedYear);

  const [view, setView] = useState<View>('rombel');
  const [picked, setPicked] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureMonth, setCaptureMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [deleteOpen, setDeleteOpen] = useState(false);

  const periods = useMemo(() => Array.from(new Set(snaps.map((s) => s.period))).sort().reverse(), [snaps]); // terbaru dulu
  const period = picked && periods.includes(picked) ? picked : periods[0] ?? null;
  const prevPeriod = period ? periods.find((p) => p < period) ?? null : null;

  const byPeriod = useMemo(() => {
    const m = new Map<string, StudentSnapshot[]>();
    snaps.forEach((s) => { const a = m.get(s.period) ?? []; a.push(s); m.set(s.period, a); });
    return m;
  }, [snaps]);

  const sum = (list: StudentSnapshot[] | undefined) => ({
    male: (list ?? []).reduce((a, s) => a + s.male, 0),
    female: (list ?? []).reduce((a, s) => a + s.female, 0),
    total: (list ?? []).reduce((a, s) => a + s.total, 0),
  });
  const cur = sum(period ? byPeriod.get(period) : undefined);
  const prev = prevPeriod ? sum(byPeriod.get(prevPeriod)) : null;

  const rows: Row[] = useMemo(() => {
    if (!period) return [];
    const now = byPeriod.get(period) ?? [];
    const before = prevPeriod ? byPeriod.get(prevPeriod) ?? [] : [];
    if (view === 'tingkat') {
      const grades = Array.from(new Set([...now, ...before].map((s) => s.grade))).sort((a, b) => a - b);
      return grades.map((g) => {
        const a = sum(now.filter((s) => s.grade === g));
        const b = sum(before.filter((s) => s.grade === g));
        return { key: `g${g}`, label: `Kelas ${g}`, ...a, delta: prevPeriod ? a.total - b.total : null, isNew: false };
      });
    }
    const prevByClass = new Map(before.map((s) => [s.class_id ?? s.class_name, s]));
    return [...now]
      .sort((x, y) => x.class_name.localeCompare(y.class_name, 'id', { numeric: true }))
      .map((s) => {
        const p = prevByClass.get(s.class_id ?? s.class_name);
        return { key: s.id, label: s.class_name, male: s.male, female: s.female, total: s.total, delta: prevPeriod && p ? s.total - p.total : null, isNew: !!prevPeriod && !p };
      });
  }, [period, prevPeriod, byPeriod, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const trend = useMemo(() => [...periods].reverse().map((p) => {
    const s = sum(byPeriod.get(p));
    return { bulan: periodShort(p), Laki: s.male, Perempuan: s.female, Total: s.total };
  }), [periods, byPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = period ? (byPeriod.get(period) ?? [])[0] : undefined;
  const sourceNote = current
    ? current.source === 'auto' ? 'Direkam otomatis akhir bulan'
      : `${current.source === 'lazy' ? 'Disusul' : 'Disimpan manual'} pada ${new Date(current.captured_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['student-snapshots'] });
  const capture = useMutation({
    mutationFn: async () => {
      const { data, error } = await snapDb.rpc('capture_student_snapshot', { _period: `${captureMonth}-01` });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Snapshot tersimpan (${n} rombel)`); setCaptureOpen(false); setPicked(null); refresh(); },
    onError: (e: any) => toast.error(`Gagal menyimpan snapshot: ${e?.message ?? 'kesalahan'}`),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await snapDb.from('student_count_snapshots').delete().eq('period', period);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Snapshot dihapus'); setDeleteOpen(false); setPicked(null); refresh(); },
    onError: () => toast.error('Gagal menghapus snapshot'),
  });

  const exportExcel = () => {
    const asc = [...periods].reverse();
    const mk = (keyOf: (s: StudentSnapshot) => string, sortKeys: (a: string, b: string) => number) => {
      const keys = Array.from(new Set(snaps.map(keyOf))).sort(sortKeys);
      const head = ['Rombel/Tingkat', ...asc.flatMap((p) => [`${periodShort(p)} L`, `${periodShort(p)} P`, `${periodShort(p)} Total`])];
      const body = keys.map((k) => [k, ...asc.flatMap((p) => {
        const l = (byPeriod.get(p) ?? []).filter((s) => keyOf(s) === k);
        const a = sum(l);
        return l.length ? [a.male, a.female, a.total] : ['', '', ''];
      })]);
      const tot = ['TOTAL', ...asc.flatMap((p) => { const a = sum(byPeriod.get(p)); return [a.male, a.female, a.total]; })];
      const ws = XLSX.utils.aoa_to_sheet([head, ...body, tot]);
      ws['!cols'] = [{ wch: 18 }, ...asc.flatMap(() => [{ wch: 7 }, { wch: 7 }, { wch: 9 }])];
      return ws;
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, mk((s) => s.class_name, (a, b) => a.localeCompare(b, 'id', { numeric: true })), 'Per Rombel');
    XLSX.utils.book_append_sheet(wb, mk((s) => `Kelas ${s.grade}`, (a, b) => a.localeCompare(b, 'id', { numeric: true })), 'Per Tingkat');
    XLSX.writeFile(wb, `riwayat-jumlah-siswa-${(selectedYear ?? '').replace('/', '-')}.xlsx`);
  };

  if (isLoading) return <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Posisi akhir bulan</Label>
          <Select value={period ?? ''} onValueChange={setPicked} disabled={periods.length === 0}>
            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Belum ada riwayat" /></SelectTrigger>
            <SelectContent>{periods.map((p) => <SelectItem key={p} value={p}>{periodLabel(p)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {canCapture && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCaptureOpen(true)}><Save className="h-4 w-4" /> Simpan Snapshot</Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportExcel} disabled={periods.length === 0}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          {canDelete && period && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteOpen(true)} aria-label="Hapus snapshot bulan ini"><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      {periods.length === 0 || !period ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <CalendarClock className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">Belum ada riwayat bulanan untuk tahun pelajaran ini</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Snapshot direkam otomatis setiap akhir bulan. Data bulan-bulan sebelum fitur ini aktif tidak dapat direkonstruksi;
            {canCapture ? ' klik "Simpan Snapshot" untuk merekam kondisi saat ini.' : ' hubungi admin untuk merekam kondisi saat ini.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[['Laki-laki', cur.male, prev?.male], ['Perempuan', cur.female, prev?.female], ['Total', cur.total, prev?.total]].map(([l, v, p]) => (
              <div key={l as string} className="rounded-xl border p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l as string}</p>
                <p className="text-xl font-bold tabular-nums">{v as number}</p>
                {prev && <p className="text-[11px] text-muted-foreground">vs {periodShort(prevPeriod!)}: <DeltaBadge d={(v as number) - (p as number)} /></p>}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-normal">{periodLabel(period)}</Badge>
            <span>{sourceNote}</span>
            {!prev && <span>· belum ada bulan sebelumnya untuk dibandingkan</span>}
          </div>

          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="rombel">Per Rombel</TabsTrigger>
              <TabsTrigger value="tingkat">Per Tingkat</TabsTrigger>
              <TabsTrigger value="tren">Tren</TabsTrigger>
            </TabsList>
          </Tabs>

          {view === 'tren' ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: 0, right: 12, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} domain={['dataMin - 5', 'dataMax + 5']} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Total" stroke="#f59e0b" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="Laki" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="Perempuan" stroke="#ec4899" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-12 gap-2 border-b bg-muted/40 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                <div className="col-span-4">{view === 'rombel' ? 'Kelas' : 'Tingkat'}</div>
                <div className="col-span-2 text-center">L</div><div className="col-span-2 text-center">P</div>
                <div className="col-span-2 text-center">Total</div><div className="col-span-2 text-right">Δ bln lalu</div>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {rows.map((r) => (
                  <div key={r.key} className="grid grid-cols-12 items-center gap-2 border-b px-3 py-2.5 text-sm last:border-b-0">
                    <div className="col-span-4 truncate font-semibold">{r.label}</div>
                    <div className="col-span-2 text-center tabular-nums">{r.male}</div>
                    <div className="col-span-2 text-center tabular-nums">{r.female}</div>
                    <div className="col-span-2 text-center font-bold tabular-nums">{r.total}</div>
                    <div className="col-span-2 text-right"><DeltaBadge d={r.delta} isNew={r.isNew} /></div>
                  </div>
                ))}
                <div className="grid grid-cols-12 items-center gap-2 bg-muted/40 px-3 py-2.5 text-sm font-bold">
                  <div className="col-span-4">Total</div>
                  <div className="col-span-2 text-center tabular-nums">{cur.male}</div>
                  <div className="col-span-2 text-center tabular-nums">{cur.female}</div>
                  <div className="col-span-2 text-center tabular-nums">{cur.total}</div>
                  <div className="col-span-2 text-right">{prev ? <DeltaBadge d={cur.total - prev.total} /> : null}</div>
                </div>
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Δ = selisih total siswa dibanding snapshot sebelumnya (mutasi masuk dikurangi mutasi keluar dan perpindahan rombel).</p>
        </>
      )}

      <Dialog open={captureOpen} onOpenChange={setCaptureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Simpan Snapshot Jumlah Siswa</DialogTitle>
            <DialogDescription>Merekam jumlah siswa aktif SAAT INI sebagai data akhir bulan yang dipilih. Snapshot bulan yang sama akan ditimpa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Bulan</Label>
            <Input type="month" value={captureMonth} onChange={(e) => setCaptureMonth(e.target.value)} />
            <p className="text-xs text-muted-foreground">Untuk bulan yang sudah lewat, data yang tersimpan adalah kondisi hari ini dan ditandai "disimpan manual".</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCaptureOpen(false)} disabled={capture.isPending}>Batal</Button>
            <Button onClick={() => capture.mutate()} disabled={!captureMonth || capture.isPending} className="gap-2">
              {capture.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus snapshot {period ? periodLabel(period) : ''}?</AlertDialogTitle>
            <AlertDialogDescription>Riwayat bulan ini akan dihapus dan tidak dapat dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
