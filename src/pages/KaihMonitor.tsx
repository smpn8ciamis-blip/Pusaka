import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, FileText, Loader2, Search } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataPagination } from '@/components/ui/data-pagination';
import { usePagination } from '@/components/ui/usePagination';
import { PdfPreviewDialog } from '@/components/piket/PdfPreviewDialog';
import { KaihPercentChart } from '@/components/kaih/KaihPercentChart';
import { KaihStudentDetailDialog } from '@/components/kaih/KaihStudentDetailDialog';
import { PAPER_LABEL, type PdfPaper } from '@/lib/pdfPaper';
import { buildKaihRecapPdf, kaihRecapFileName } from '@/lib/kaihPdf';
import {
  addDaysIso, daysBetween, fetchAllRows, firstOfMonthIso, fmtDateLong, fmtPct, HABITS, pct, rowAverage, rowPercent, statsFromSummary, todayWib,
  type KaihStudentSummary,
} from '@/lib/kaih';

const db = supabase as any;
const ALL = '__all__';

type SortKey = 'name' | 'class' | 'entries' | 'fill' | 'avg' | `h_${string}`;
type StatusFilter = 'all' | 'none' | 'some' | 'low' | 'good';

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'Semua siswa',
  none: 'Belum pernah mengisi',
  some: 'Sudah mengisi',
  low: 'Rata-rata di bawah 50%',
  good: 'Rata-rata 80% ke atas',
};

const PDF_PREFS_KEY = 'pusaka.kaihMonitor.pdfPrefs';
const loadPdfPrefs = (): { place: string; paper: PdfPaper } => {
  try {
    const raw = JSON.parse(localStorage.getItem(PDF_PREFS_KEY) || '{}');
    return { place: typeof raw.place === 'string' ? raw.place : 'Ciamis', paper: raw.paper === 'f4' ? 'f4' : 'a4' };
  } catch {
    return { place: 'Ciamis', paper: 'a4' };
  }
};

const pctColor = (v: number, entries: number) =>
  entries === 0 ? 'text-muted-foreground' : v >= 80 ? 'text-emerald-600 font-medium' : v >= 50 ? 'text-amber-600' : 'text-red-600';

export default function KaihMonitor() {
  const { user, userRole } = useAuth();
  const { selectedYear } = useAcademicYear();
  const today = todayWib();
  const canSeeAll = userRole === 'admin' || userRole === 'super_admin' || userRole === 'kesiswaan';

  // ---- data pendukung ----
  const { data: teacherInfo } = useQuery({
    queryKey: ['kaih-teacher-info', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('teachers').select('id, nip').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
  const { data: myProfile } = useQuery({
    queryKey: ['kaih-profile-name', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('full_name').eq('id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings-letterhead'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_school_settings_for_letterhead');
      if (error) throw error;
      return (data ?? null) as any;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Daftar kelas yang boleh dipantau: semua kelas (kesiswaan/admin) atau kelas yang diampu (wali kelas)
  const { data: classes = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['kaih-classes', user?.id, canSeeAll, teacherInfo?.id, selectedYear],
    queryFn: async () => {
      let q = supabase.from('classes').select('id, name, academic_year, homeroom_teacher_id').order('name');
      if (selectedYear) q = q.eq('academic_year', selectedYear);
      if (!canSeeAll) {
        if (!teacherInfo?.id) return [];
        q = q.eq('homeroom_teacher_id', teacherInfo.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!user?.id && (canSeeAll || teacherInfo !== undefined),
  });

  // ---- filter ----
  const [classId, setClassId] = useState<string>(ALL);
  const [startDate, setStartDate] = useState(() => firstOfMonthIso(todayWib()));
  const [endDate, setEndDate] = useState(() => todayWib());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('class');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Wali kelas: langsung pilih kelasnya
  useEffect(() => {
    if (!canSeeAll && classes.length > 0 && classId === ALL && classes.length === 1) setClassId(classes[0].id);
    if (classId !== ALL && classes.length > 0 && !classes.some((c) => c.id === classId)) setClassId(ALL);
  }, [classes, canSeeAll, classId]);

  const quick = (kind: 'week' | 'month' | 'semester') => {
    setEndDate(today);
    setStartDate(kind === 'week' ? addDaysIso(today, -6) : kind === 'month' ? firstOfMonthIso(today) : addDaysIso(today, -180));
  };

  const rangeOk = !!startDate && !!endDate && startDate <= endDate;
  const classParam = classId === ALL ? null : classId;
  const noClass = !canSeeAll && !loadingClasses && classes.length === 0;

  // ---- data rekap ----
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['kaih-summary', startDate, endDate, classParam],
    queryFn: () =>
      fetchAllRows<KaihStudentSummary>((from, to) =>
        db.rpc('kaih_student_summary', { p_start: startDate, p_end: endDate, p_class: classParam }).range(from, to),
      ),
    enabled: rangeOk && !noClass && !loadingClasses,
  });
  const { data: daily = [] } = useQuery({
    queryKey: ['kaih-daily', startDate, endDate, classParam],
    queryFn: async () => {
      const { data, error } = await db.rpc('kaih_daily', { p_start: startDate, p_end: endDate, p_class: classParam });
      if (error) throw error;
      return (data ?? []) as { entry_date: string; entries: number; done: number }[];
    },
    enabled: rangeOk && !noClass && !loadingClasses,
  });

  const effectiveEnd = endDate > today ? today : endDate;
  const periodDays = rangeOk ? daysBetween(startDate, effectiveEnd) : 0;
  const fillPct = (r: KaihStudentSummary) => pct(r.entries, periodDays);

  // ---- saring & urutkan ----
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !(r.full_name.toLowerCase().includes(q) || (r.nisn ?? '').toLowerCase().includes(q))) return false;
      switch (status) {
        case 'none': return r.entries === 0;
        case 'some': return r.entries > 0;
        case 'low': return r.entries > 0 && rowAverage(r) < 50;
        case 'good': return r.entries > 0 && rowAverage(r) >= 80;
        default: return true;
      }
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (r: KaihStudentSummary): string | number => {
      if (sortKey === 'name') return r.full_name.toLowerCase();
      if (sortKey === 'class') return (r.class_name ?? '￿').toLowerCase();
      if (sortKey === 'entries') return r.entries;
      if (sortKey === 'fill') return fillPct(r);
      if (sortKey === 'avg') return rowAverage(r);
      return rowPercent(r, sortKey.slice(2) as any);
    };
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'id');
      return c !== 0 ? c * dir : a.full_name.localeCompare(b.full_name, 'id');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, status, sortKey, sortDir, periodDays]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'name' || k === 'class' ? 'asc' : 'desc'); }
  };
  const SortHead = ({ k, children, className = '' }: { k: SortKey; children: ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none whitespace-nowrap ${className}`} onClick={() => toggleSort(k)}>
      {children}
      {sortKey !== k ? <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" /> : sortDir === 'asc' ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />}
    </TableHead>
  );

  const pager = usePagination(visible, 10);
  useEffect(() => { pager.setCurrentPage(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [startDate, endDate, classId, search, status, sortKey, sortDir]);

  // ---- ringkasan & grafik ----
  const agg = useMemo(() => statsFromSummary(visible), [visible]);
  const filled = visible.filter((r) => r.entries > 0).length;
  const avgFill = visible.length && periodDays ? pct(visible.reduce((a, r) => a + r.entries, 0), visible.length * periodDays) : 0;

  const classChart = useMemo(() => {
    const m = new Map<string, { entries: number; done: number }>();
    visible.forEach((r) => {
      const k = r.class_name ?? '(tanpa kelas)';
      const cur = m.get(k) ?? { entries: 0, done: 0 };
      cur.entries += r.entries;
      cur.done += HABITS.reduce((a, h) => a + r[h.key], 0);
      m.set(k, cur);
    });
    return [...m.entries()]
      .map(([name, v]) => ({ name, percent: pct(v.done, v.entries * HABITS.length), entries: v.entries }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true }));
  }, [visible]);

  const dailyChart = useMemo(
    () => daily.map((d) => ({ label: d.entry_date.slice(8, 10) + '/' + d.entry_date.slice(5, 7), percent: pct(d.done, d.entries * 7), entries: d.entries })),
    [daily],
  );

  // ---- detail siswa ----
  const [detail, setDetail] = useState<KaihStudentSummary | null>(null);

  // ---- PDF ----
  const defaultTitle = canSeeAll ? (userRole === 'kesiswaan' ? 'Waka Kesiswaan' : 'Kepala Sekolah') : 'Wali Kelas';
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfPrefs, setPdfPrefs] = useState(loadPdfPrefs);
  const [signDate, setSignDate] = useState(() => todayWib());
  const [onlyFiltered, setOnlyFiltered] = useState(true);
  const [signerTitle, setSignerTitle] = useState<string | null>(null);
  const [signerName, setSignerName] = useState<string | null>(null);
  const [signerNip, setSignerNip] = useState<string | null>(null);
  const effTitle = signerTitle ?? defaultTitle;
  const effName = signerName ?? myProfile?.full_name ?? '';
  const effNip = signerNip ?? (teacherInfo as any)?.nip ?? '';
  const patchPdfPrefs = (p: Partial<{ place: string; paper: PdfPaper }>) =>
    setPdfPrefs((prev) => {
      const next = { ...prev, ...p };
      try { localStorage.setItem(PDF_PREFS_KEY, JSON.stringify(next)); } catch { /* abaikan */ }
      return next;
    });

  const className = classId === ALL ? null : classes.find((c) => c.id === classId)?.name ?? null;
  const scopeLabel = className ? `Kelas ${className}` : canSeeAll ? 'Semua Kelas' : 'Semua Kelas Perwalian';
  const pdfRows = onlyFiltered ? visible : rows;
  const showClass = new Set(pdfRows.map((r) => r.class_id)).size > 1;

  const rebuildRaw = [
    pdfPrefs.place, pdfPrefs.paper, signDate, onlyFiltered, effTitle, effName, effNip, startDate, endDate, classId, !!schoolSettings,
    pdfRows.map((r) => `${r.student_id}:${r.entries}:${HABITS.map((h) => r[h.key]).join('.')}`).join(','),
  ].join('|');
  const [rebuildKey, setRebuildKey] = useState(rebuildRaw);
  useEffect(() => {
    const t = setTimeout(() => setRebuildKey(rebuildRaw), 500);
    return () => clearTimeout(t);
  }, [rebuildRaw]);

  const buildPdf = async () => {
    if (!schoolSettings) throw new Error('Pengaturan sekolah belum dimuat. Tutup lalu coba lagi sebentar lagi.');
    return buildKaihRecapPdf(
      {
        scopeLabel,
        startDate,
        endDate,
        rows: pdfRows,
        showClass,
        signerTitle: effTitle,
        signerName: effName,
        signerNip: effNip,
        place: pdfPrefs.place,
        signDate,
        paper: pdfPrefs.paper,
        note: onlyFiltered && pdfRows.length !== rows.length ? `Hanya ${pdfRows.length} dari ${rows.length} siswa (sesuai filter).` : undefined,
      },
      schoolSettings,
    );
  };
  const openPdf = () => {
    if (!schoolSettings) { toast.error('Pengaturan sekolah belum dimuat. Silakan coba lagi.'); return; }
    if (rows.length === 0) { toast.error('Tidak ada siswa pada cakupan ini.'); return; }
    setPreviewOpen(true);
  };

  // ---- tampilan ----
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pantau Jurnal 7 Kebiasaan</h1>
            <p className="text-sm text-muted-foreground">
              {canSeeAll ? 'Pantau jurnal Gerakan 7 Kebiasaan Anak Indonesia Hebat seluruh siswa.' : 'Pantau jurnal Gerakan 7 Kebiasaan Anak Indonesia Hebat siswa perwalian Anda.'}
            </p>
          </div>
          <Button variant="outline" onClick={openPdf} disabled={!rangeOk || isLoading}><FileText className="mr-2 h-4 w-4" />Pratinjau PDF</Button>
        </div>

        {noClass ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Anda belum tercatat sebagai wali kelas{selectedYear ? ` pada tahun ajaran ${selectedYear}` : ''}.</CardContent></Card>
        ) : (
          <>
            {/* Filter */}
            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 pt-6">
                <div>
                  <Label className="text-xs">Kelas</Label>
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(canSeeAll || classes.length > 1) && <SelectItem value={ALL}>{canSeeAll ? 'Semua kelas' : 'Semua kelas saya'}</SelectItem>}
                      {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Dari tanggal</Label>
                  <Input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
                </div>
                <div>
                  <Label className="text-xs">Sampai tanggal</Label>
                  <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => quick('week')}>7 hari</Button>
                  <Button variant="outline" size="sm" onClick={() => quick('month')}>Bulan ini</Button>
                  <Button variant="outline" size="sm" onClick={() => quick('semester')}>6 bulan</Button>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((k) => <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative min-w-[12rem] flex-1">
                  <Label className="text-xs">Cari nama / NISN</Label>
                  <Search className="absolute bottom-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ketik nama atau NISN…" className="pl-8" />
                </div>
              </CardContent>
            </Card>
            {!rangeOk && <p className="text-sm text-destructive">Rentang tanggal tidak valid: tanggal awal harus sebelum atau sama dengan tanggal akhir.</p>}
            {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

            {/* Ringkasan */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardDescription>Siswa</CardDescription><CardTitle className="text-2xl">{visible.length}</CardTitle></CardHeader></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Sudah mengisi</CardDescription><CardTitle className="text-2xl">{filled}<span className="text-sm font-normal text-muted-foreground"> / {visible.length}</span></CardTitle></CardHeader></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Rata-rata keterisian</CardDescription><CardTitle className="text-2xl">{fmtPct(avgFill)}</CardTitle></CardHeader></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Rata-rata pelaksanaan</CardDescription><CardTitle className="text-2xl">{fmtPct(agg.overall)}</CardTitle></CardHeader></Card>
            </div>

            {/* Grafik */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Persentase tiap kebiasaan</CardTitle>
                  <CardDescription>Sesuai siswa yang tampil pada filter. {agg.total} jurnal dihitung.</CardDescription>
                </CardHeader>
                <CardContent><KaihPercentChart stats={agg.stats} total={agg.total} height={300} /></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Tren harian</CardTitle>
                  <CardDescription>Persentase kebiasaan terlaksana per tanggal (semua jurnal pada cakupan kelas).</CardDescription>
                </CardHeader>
                <CardContent>
                  {dailyChart.length === 0 ? (
                    <div className="flex h-[300px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">Belum ada jurnal pada periode ini.</div>
                  ) : (
                    <div style={{ height: 300 }} role="img" aria-label="Grafik tren harian">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyChart} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <Tooltip formatter={(v: any, _n: any, item: any) => [`${fmtPct(Number(v))} (${item.payload.entries} jurnal)`, 'Terlaksana']} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }} />
                          <Line type="monotone" dataKey="percent" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {classChart.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Perbandingan antar kelas</CardTitle>
                  <CardDescription>Rata-rata persentase pelaksanaan seluruh kebiasaan per kelas.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div style={{ height: Math.max(200, classChart.length * 30 + 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classChart} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip formatter={(v: any, _n: any, item: any) => [`${fmtPct(Number(v))} (${item.payload.entries} jurnal)`, 'Rata-rata']} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }} />
                        <Bar dataKey="percent" radius={[0, 4, 4, 0]}>
                          {classChart.map((c) => <Cell key={c.name} fill="#3b82f6" />)}
                          <LabelList dataKey="percent" position="right" formatter={(v: any) => fmtPct(Number(v))} style={{ fontSize: 11 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabel */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Rekap per siswa</CardTitle>
                <CardDescription>Periode {rangeOk ? `${fmtDateLong(startDate)} – ${fmtDateLong(endDate)} (${periodDays} hari)` : '-'}. % Isi = jurnal terisi ÷ hari pada periode; persentase kebiasaan = hari terlaksana ÷ jurnal terisi. Klik judul kolom untuk mengurutkan.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortHead k="name">Nama</SortHead>
                        <SortHead k="class">Kelas</SortHead>
                        <SortHead k="entries" className="text-center">Terisi</SortHead>
                        <SortHead k="fill" className="text-center">% Isi</SortHead>
                        {HABITS.map((h) => (
                          <SortHead key={h.key} k={`h_${h.key}`} className="text-center">
                            <span title={`${h.no}. ${h.label}`}><h.icon className="inline h-4 w-4" style={{ color: h.color }} aria-label={h.label} /></span>
                          </SortHead>
                        ))}
                        <SortHead k="avg" className="text-center">Rata-rata</SortHead>
                        <TableHead className="text-right">Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={HABITS.length + 6} className="py-8 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Memuat…</TableCell></TableRow>
                      ) : pager.paginatedItems.length === 0 ? (
                        <TableRow><TableCell colSpan={HABITS.length + 6} className="py-8 text-center text-muted-foreground">Tidak ada siswa yang cocok dengan filter.</TableCell></TableRow>
                      ) : (
                        pager.paginatedItems.map((r) => (
                          <TableRow key={r.student_id}>
                            <TableCell className="min-w-[11rem]">
                              <div className="font-medium">{r.full_name}</div>
                              {r.nisn && <div className="text-xs text-muted-foreground">{r.nisn}</div>}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{r.class_name ?? '-'}</TableCell>
                            <TableCell className="text-center">{r.entries}</TableCell>
                            <TableCell className={`text-center ${pctColor(fillPct(r), 1)}`}>{fmtPct(fillPct(r))}</TableCell>
                            {HABITS.map((h) => {
                              const v = rowPercent(r, h.key);
                              return <TableCell key={h.key} className={`text-center text-xs ${pctColor(v, r.entries)}`}>{r.entries ? fmtPct(v) : '-'}</TableCell>;
                            })}
                            <TableCell className={`text-center ${pctColor(rowAverage(r), r.entries)}`}>{r.entries ? fmtPct(rowAverage(r)) : '-'}</TableCell>
                            <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => setDetail(r)} title="Lihat jurnal siswa"><Eye className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <DataPagination
                  currentPage={pager.currentPage}
                  totalPages={pager.totalPages}
                  totalItems={pager.totalItems}
                  pageSize={pager.pageSize}
                  onPageChange={pager.setCurrentPage}
                  onPageSizeChange={pager.setPageSize}
                  pageSizeOptions={[10, 25, 50, 100]}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <KaihStudentDetailDialog
        open={!!detail}
        onClose={() => setDetail(null)}
        studentId={detail?.student_id ?? null}
        studentName={detail?.full_name ?? ''}
        className={detail?.class_name}
        startDate={startDate}
        endDate={endDate}
      />

      <PdfPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Pratinjau Rekap Jurnal 7 Kebiasaan"
        filename={kaihRecapFileName(scopeLabel, startDate, endDate)}
        build={buildPdf}
        rebuildKey={rebuildKey}
        toolbar={
          <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
            <div>
              <Label className="text-xs">Tempat titimangsa</Label>
              <Input value={pdfPrefs.place} maxLength={60} onChange={(e) => patchPdfPrefs({ place: e.target.value })} placeholder="Ciamis" className="w-36" />
            </div>
            <div>
              <Label className="text-xs">Tanggal titimangsa</Label>
              <Input type="date" value={signDate} onChange={(e) => setSignDate(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">Kertas</Label>
              <Select value={pdfPrefs.paper} onValueChange={(v) => patchPdfPrefs({ paper: v as PdfPaper })}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAPER_LABEL) as PdfPaper[]).map((k) => <SelectItem key={k} value={k}>{PAPER_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Jabatan penanda tangan</Label>
              <Input value={effTitle} maxLength={60} onChange={(e) => setSignerTitle(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">Nama penanda tangan</Label>
              <Input value={effName} maxLength={80} onChange={(e) => setSignerName(e.target.value)} className="w-48" />
            </div>
            <div>
              <Label className="text-xs">NIP</Label>
              <Input value={effNip} maxLength={30} onChange={(e) => setSignerNip(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Checkbox id="kaih-pdf-filtered" checked={onlyFiltered} onCheckedChange={(v) => setOnlyFiltered(v === true)} />
              <Label htmlFor="kaih-pdf-filtered" className="text-xs">Ikuti filter &amp; urutan tabel ({visible.length} dari {rows.length} siswa)</Label>
            </div>
          </div>
        }
      />
    </DashboardLayout>
  );
}
