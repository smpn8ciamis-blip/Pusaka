import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Activity, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Clock, Loader2, MoreHorizontal, Pause, Play, Power,
  Printer, RefreshCcw, RotateCcw, Search, ShieldAlert, Users, WifiOff, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PdfPreviewDialog } from '@/components/piket/PdfPreviewDialog';
import { PAPER_LABEL, type PdfPaper } from '@/lib/pdfPaper';
import { ORDER_LABEL, buildCbtResultPdf, describeFilter, reportFileName, type ReportOrder } from '@/lib/cbtResultPdf';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataPagination } from '@/components/ui/data-pagination';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { violationLabel } from '@/lib/cbtAntiCheat';
import {
  DEFAULT_SORT, EMPTY_FILTER, STATUS_LABEL, applyFilter, buildRows, chunk, clampPage, formatAgo, formatClock, isFilterActive,
  pageSlice, runLimited, sortRows, summarize,
  type MonFilter, type MonRow, type MonSort, type MonStatus, type RawSession, type RawStudent, type SortKey, type ViolationInfo,
} from '@/lib/cbtMonitor';

const POLL_MS = 10_000;
const PAGE_SIZES = [25, 50, 100];
/** Daftar id pada alamat permintaan dibatasi agar header proxy tidak melebihi batas (lihat catatan 502 student_mutations). */
const IDS_PER_REQUEST = 40;

type SessionAction = 'pause' | 'resume' | 'finalize' | 'reset';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'attention', label: 'Perlu perhatian' },
  { key: 'name', label: 'Nama' },
  { key: 'class', label: 'Kelas' },
  { key: 'status', label: 'Status' },
  { key: 'progress', label: 'Progres' },
  { key: 'time', label: 'Sisa waktu' },
  { key: 'activity', label: 'Aktivitas terakhir' },
  { key: 'violations', label: 'Pelanggaran' },
  { key: 'score', label: 'Skor' },
];

/** Ambil semua baris (PostgREST membatasi 1000 per permintaan). */
async function fetchAllPages<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const STATUS_STYLE: Record<MonStatus, string> = {
  belum: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  mengerjakan: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  jeda: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  selesai: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
};

function StatusBadge({ r }: { r: MonRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
      {r.offline && r.status !== 'selesai' && (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-destructive" title="Tidak ada denyut > 90 detik">
          <WifiOff className="h-3 w-3" /> offline
        </span>
      )}
    </span>
  );
}

function Violations({ r }: { r: MonRow }) {
  if (r.violations <= 0) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium" title={r.lastViolation ? `Terakhir: ${violationLabel(r.lastViolation)}` : undefined}>
      <ShieldAlert className="h-3.5 w-3.5" /> {r.violations}
    </span>
  );
}

interface RowProps {
  r: MonRow;
  totalQ: number;
  passScore: number;
  now: number;
  selected: boolean;
  antiCheat: boolean;
  onToggle: (r: MonRow) => void;
  onOpen: (r: MonRow) => void;
  onAction: (r: MonRow, a: SessionAction) => void;
}

function RowMenu({ r, onAction }: { r: MonRow; onAction: (r: MonRow, a: SessionAction) => void }) {
  if (!r.sessionId) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Aksi untuk ${r.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {r.status === 'mengerjakan' && <DropdownMenuItem onClick={() => onAction(r, 'pause')}><Pause className="h-4 w-4 mr-2" /> Jeda</DropdownMenuItem>}
        {r.status === 'jeda' && <DropdownMenuItem onClick={() => onAction(r, 'resume')}><Play className="h-4 w-4 mr-2" /> Lanjutkan</DropdownMenuItem>}
        {r.status !== 'selesai' && <DropdownMenuItem onClick={() => onAction(r, 'finalize')}><Power className="h-4 w-4 mr-2" /> Akhiri ujian</DropdownMenuItem>}
        {r.status !== 'selesai' && <DropdownMenuSeparator />}
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction(r, 'reset')}><RotateCcw className="h-4 w-4 mr-2" /> Reset sesi</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ProgressCell = ({ r, totalQ }: { r: MonRow; totalQ: number }) => (
  <div className="min-w-[110px]">
    <div className="flex justify-between text-[11px] mb-0.5">
      <span className="text-muted-foreground">{r.status === 'selesai' ? 'Selesai' : `${r.answered}/${totalQ}`}</span>
      <span className="font-medium">{r.progress}%</span>
    </div>
    <Progress value={r.progress} className="h-1.5" />
  </div>
);

const TableRowView = memo(function TableRowView({ r, totalQ, passScore, now, selected, antiCheat, onToggle, onOpen, onAction }: RowProps) {
  return (
    <TableRow data-state={selected ? 'selected' : undefined} className={r.offline && r.status === 'mengerjakan' ? 'bg-destructive/5' : undefined}>
      <TableCell className="w-8">
        {r.sessionId && <Checkbox checked={selected} onCheckedChange={() => onToggle(r)} aria-label={`Pilih ${r.name}`} />}
      </TableCell>
      <TableCell>
        <button type="button" className="text-left hover:underline disabled:no-underline" disabled={!r.sessionId} onClick={() => onOpen(r)}>
          <div className="font-medium text-sm leading-tight">{r.name}</div>
          <div className="text-[11px] text-muted-foreground">{r.nis}{r.remedial && <Badge variant="outline" className="ml-1 px-1 py-0 text-[9px] border-amber-500 text-amber-600">Remidial</Badge>}</div>
        </button>
      </TableCell>
      <TableCell className="text-sm whitespace-nowrap">{r.classLabel}</TableCell>
      <TableCell><StatusBadge r={r} /></TableCell>
      <TableCell>{r.status === 'belum' ? <span className="text-muted-foreground">–</span> : <ProgressCell r={r} totalQ={totalQ} />}</TableCell>
      <TableCell className="font-mono text-xs">{r.status === 'mengerjakan' || r.status === 'jeda' ? formatClock(r.timeLeft) : '–'}</TableCell>
      <TableCell className={`text-xs whitespace-nowrap ${r.offline && r.status !== 'selesai' && r.status !== 'belum' ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
        {r.status === 'belum' ? '–' : formatAgo(r.lastActivityMs, now)}
      </TableCell>
      {antiCheat && <TableCell><Violations r={r} /></TableCell>}
      <TableCell className="text-sm font-semibold">
        {r.status === 'selesai' ? (
          <span className={r.score != null && r.score >= passScore ? 'text-emerald-600' : 'text-destructive'}>{r.score != null ? r.score.toFixed(1) : '–'}</span>
        ) : '–'}
      </TableCell>
      <TableCell className="w-10 text-right"><RowMenu r={r} onAction={onAction} /></TableCell>
    </TableRow>
  );
});

const CardRowView = memo(function CardRowView({ r, totalQ, passScore, now, selected, antiCheat, onToggle, onOpen, onAction }: RowProps) {
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${selected ? 'ring-2 ring-primary/50' : ''} ${r.offline && r.status === 'mengerjakan' ? 'border-destructive/40 bg-destructive/5' : ''}`}>
      <div className="flex items-start gap-2">
        {r.sessionId && <Checkbox className="mt-1" checked={selected} onCheckedChange={() => onToggle(r)} aria-label={`Pilih ${r.name}`} />}
        <button type="button" className="flex-1 min-w-0 text-left" disabled={!r.sessionId} onClick={() => onOpen(r)}>
          <div className="font-semibold text-sm truncate">{r.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{r.nis} • {r.classLabel}</div>
        </button>
        <StatusBadge r={r} />
        <RowMenu r={r} onAction={onAction} />
      </div>
      {r.status !== 'belum' && <ProgressCell r={r} totalQ={totalQ} />}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {r.status === 'mengerjakan' || r.status === 'jeda' ? formatClock(r.timeLeft) : '–'}</span>
        {r.status !== 'belum' && <span className={r.offline && r.status !== 'selesai' ? 'text-destructive font-medium' : ''}>{formatAgo(r.lastActivityMs, now)}</span>}
        {antiCheat && <Violations r={r} />}
        {r.status === 'selesai' && <span className={`font-semibold text-sm ${r.score != null && r.score >= passScore ? 'text-emerald-600' : 'text-destructive'}`}>{r.score != null ? r.score.toFixed(1) : '–'}</span>}
      </div>
    </div>
  );
});

function SortHead({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: MonSort; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground font-semibold' : ''}`}>
        {label} <Icon className={`h-3 w-3 ${active ? '' : 'opacity-40'}`} />
      </button>
    </TableHead>
  );
}

function StatCard({ label, value, tone, active, onClick, icon }: { label: string; value: number; tone: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm ${active ? 'ring-2 ring-primary border-primary' : ''}`}>
      <div className={`flex items-center gap-1.5 text-xs ${tone}`}>{icon}{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-0.5">{value}</div>
    </button>
  );
}

const PDF_PREFS_KEY = 'cbtMonitorPdfPrefs';
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function loadPdfPrefs(): { paper: PdfPaper; order: ReportOrder; place: string } {
  const d = { paper: 'a4' as PdfPaper, order: 'kelas-nama' as ReportOrder, place: '' };
  try {
    const j = JSON.parse(localStorage.getItem(PDF_PREFS_KEY) || '{}');
    return { paper: j.paper === 'f4' ? 'f4' : 'a4', order: j.order === 'nama' ? 'nama' : 'kelas-nama', place: typeof j.place === 'string' ? j.place.slice(0, 60) : '' };
  } catch { return d; }
}
function savePdfPrefs(p: { paper: PdfPaper; order: ReportOrder; place: string }) { try { localStorage.setItem(PDF_PREFS_KEY, JSON.stringify(p)); } catch { /* abaikan */ } }

export default function CbtMonitor() {
  const { user, userRole } = useAuth();
  const { selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<MonFilter>(EMPTY_FILTER);
  const [qInput, setQInput] = useState('');
  const [sort, setSort] = useState<MonSort>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<MonRow | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; desc: string; label: string; destructive?: boolean; run: () => void } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);

  // ---- cetak / pratinjau PDF hasil ujian (pilihan terakhir diingat di perangkat ini)
  const [pdfOpen, setPdfOpen] = useState(false);
  const [paper, setPaper] = useState<PdfPaper>(() => loadPdfPrefs().paper);
  const [order, setOrder] = useState<ReportOrder>(() => loadPdfPrefs().order);
  const [placeInput, setPlaceInput] = useState(() => loadPdfPrefs().place);
  const [place, setPlace] = useState(placeInput);
  const [signDate, setSignDate] = useState(() => todayIso());
  useEffect(() => { const t = setTimeout(() => setPlace(placeInput), 400); return () => clearTimeout(t); }, [placeInput]);
  useEffect(() => { savePdfPrefs({ paper, order, place }); }, [paper, order, place]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  // pencarian: tunda 250 ms supaya mengetik tidak menyaring ulang tiap huruf
  useEffect(() => { const t = setTimeout(() => setFilter((f) => (f.q === qInput ? f : { ...f, q: qInput })), 250); return () => clearTimeout(t); }, [qInput]);

  // ---------------------------------------------------------------- ujian
  const { data: exams, isLoading: examsLoading } = useQuery({
    queryKey: ['cbt-monitor-exams', selectedYear, user?.id, userRole],
    queryFn: async () => {
      let q = (supabase as any).from('cbt_exams')
        .select('id, title, subject, duration_minutes, total_questions, pass_score, start_datetime, end_datetime, anti_cheat_enabled, max_violations, class_id, class_ids, exam_token, created_by, created_at')
        .eq('academic_year', selectedYear).order('created_at', { ascending: false });
      if (userRole === 'teacher') q = q.eq('created_by', user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const sortedExams = useMemo(() => {
    const t = Date.now();
    const live = (e: any) => {
      const s = e.start_datetime ? new Date(e.start_datetime).getTime() : null;
      const en = e.end_datetime ? new Date(e.end_datetime).getTime() : null;
      return (s == null || s <= t) && (en == null || en >= t) && (s != null || en != null);
    };
    return (exams || []).map((e) => ({ ...e, live: live(e) })).sort((a, b) => Number(b.live) - Number(a.live));
  }, [exams]);

  const examId = params.get('exam') || sortedExams[0]?.id || '';
  const exam = useMemo(() => sortedExams.find((e) => e.id === examId) || null, [sortedExams, examId]);
  const totalQ: number = exam?.total_questions || 0;
  const antiCheat = !!exam?.anti_cheat_enabled;

  const selectExam = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('exam', id);
    setParams(next, { replace: true });
    setSelected(new Set()); setFilter(EMPTY_FILTER); setQInput(''); setPage(1); setDetail(null);
  };

  // ---------------------------------------------------------------- data sesi (hanya kolom yang dipakai, ditarik berkala)
  const sessionsQ = useQuery({
    queryKey: ['cbt-monitor-sessions', examId],
    queryFn: () => fetchAllPages<RawSession>((from, to) =>
      (supabase as any).from('cbt_exam_sessions')
        .select('id, student_id, status, attempt_number, is_remedial, answered_count, time_remaining_seconds, last_activity_at, start_time, score, correct_count, wrong_count, grading_status, students(full_name, nis, class_id, classes(name, grade))')
        .eq('exam_id', examId).order('id').range(from, to)),
    enabled: !!examId,
    refetchInterval: autoRefresh ? POLL_MS : false,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

  // Peserta yang belum mulai = siswa kelas peserta tanpa sesi. Jarang berubah, tidak ditarik berkala.
  const classIds: string[] = useMemo(() => {
    const ids: string[] = (exam?.class_ids && exam.class_ids.length ? exam.class_ids : exam?.class_id ? [exam.class_id] : []).filter(Boolean);
    return ids;
  }, [exam]);
  const rosterQ = useQuery({
    queryKey: ['cbt-monitor-roster', examId, classIds.join(',')],
    queryFn: () => fetchAllPages<RawStudent>((from, to) =>
      (supabase as any).from('students').select('id, full_name, nis, class_id, classes(name, grade)')
        .in('class_id', classIds).eq('status', 'aktif').eq('is_alumni', false).order('id').range(from, to)),
    enabled: !!examId && classIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const violationsQ = useQuery({
    queryKey: ['cbt-monitor-violations', examId],
    queryFn: async () => {
      const map = new Map<string, ViolationInfo>();
      const { data, error } = await (supabase as any).rpc('cbt_violation_summary', { p_exam_id: examId });
      if (!error) {
        for (const v of (data || []) as any[]) map.set(v.session_id, { total: v.total, lastType: v.last_type, lastAt: v.last_at });
        return map;
      }
      if (error.code !== 'PGRST202' && error.code !== '42883') throw error;
      // migrasi belum dijalankan: hitung dari kejadian terbaru (dibatasi 5000 baris)
      const { data: rows, error: e2 } = await (supabase as any).from('cbt_session_violations')
        .select('session_id, violation_type, created_at').eq('exam_id', examId).order('created_at', { ascending: false }).limit(5000);
      if (e2) throw e2;
      for (const v of (rows || []) as any[]) {
        const cur = map.get(v.session_id);
        if (cur) cur.total++; else map.set(v.session_id, { total: 1, lastType: v.violation_type, lastAt: v.created_at });
      }
      return map;
    },
    enabled: !!examId && antiCheat,
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(
    () => buildRows(sessionsQ.data || [], rosterQ.data || [], violationsQ.data || new Map(), totalQ, now),
    [sessionsQ.data, rosterQ.data, violationsQ.data, totalQ, now],
  );
  const summary = useMemo(() => summarize(rows), [rows]);

  // Pengaturan sekolah untuk kop & tanda tangan PDF. Panitia ujian tidak membaca tabel langsung: lewat fungsi server khusus ujian.
  const viaRpc = userRole === 'panitia_ujian';
  const settingsQ = useQuery({
    queryKey: [viaRpc ? 'exam-settings' : 'school-settings'],
    queryFn: async () => {
      if (viaRpc) {
        const { data, error } = await (supabase as any).rpc('exam_settings_get');
        if (error) throw error;
        return data as any;
      }
      const { data, error } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: pdfOpen,
    staleTime: 5 * 60_000,
  });

  const classOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => { if (r.classKey) m.set(r.classKey, r.classLabel); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'id', { numeric: true }));
  }, [rows]);

  const filtered = useMemo(() => applyFilter(rows, filter), [rows, filter]);
  const buildPdf = async () => {
    if (!exam) throw new Error('Pilih ujian terlebih dahulu.');
    const st = settingsQ.data ?? (await settingsQ.refetch()).data;
    if (!st) throw new Error('Pengaturan sekolah belum dimuat. Tutup lalu coba lagi.');
    return buildCbtResultPdf({
      exam, rows: filtered, order, paper, place: place || st.city_name || '', signDate,
      filterText: describeFilter(filter, (k) => classOptions.find(([id]) => id === k)?.[1]),
    }, st);
  };
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort]);
  const safePage = clampPage(page, sorted.length, pageSize);
  const pageRows = useMemo(() => pageSlice(sorted, safePage, pageSize), [sorted, safePage, pageSize]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));

  // sesi yang sudah tidak ada (mis. direset) dibuang dari pilihan
  useEffect(() => {
    setSelected((prev) => {
      if (!prev.size) return prev;
      const ids = new Set(rows.map((r) => r.sessionId).filter(Boolean) as string[]);
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const patchFilter = (p: Partial<MonFilter>) => { setFilter((f) => ({ ...f, ...p })); setPage(1); };
  const resetFilter = () => { setFilter(EMPTY_FILTER); setQInput(''); setPage(1); };
  const onSort = (k: SortKey) => { setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'progress' || k === 'violations' || k === 'score' || k === 'activity' ? 'desc' : 'asc' })); setPage(1); };

  // ---------------------------------------------------------------- aksi
  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['cbt-monitor-sessions', examId] });
    queryClient.invalidateQueries({ queryKey: ['cbt-monitor-violations', examId] });
    queryClient.invalidateQueries({ queryKey: ['cbt-results'] });
  }, [queryClient, examId]);

  const finalizeOne = async (id: string): Promise<'requested' | 'done'> => {
    // Akhiri = MINTA perangkat siswa mengumpulkan jawaban (nilai tidak 0); dipaksa langsung bila siswa tidak aktif.
    const r = await (supabase as any).rpc('cbt_finish_or_request', { p_session_id: id });
    if (r.error) {
      if (r.error.code === 'PGRST202' || r.error.code === '42883') {
        const { error } = await (supabase as any).rpc('cbt_force_finish', { p_session_id: id });
        if (error) throw error;
        return 'done';
      }
      throw r.error;
    }
    return r.data?.requested ? 'requested' : 'done';
  };

  const runAction = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: SessionAction }) => {
      if (action === 'pause' || action === 'resume') {
        const patch = action === 'pause' ? { status: 'paused' } : { status: 'in_progress', last_activity_at: new Date().toISOString() };
        let failedIds = 0;
        await runLimited(chunk(ids, IDS_PER_REQUEST), 3, async (part) => {
          const { error } = await (supabase as any).from('cbt_exam_sessions').update(patch).in('id', part);
          if (error) { failedIds += part.length; throw error; }
        });
        return { action, total: ids.length, requested: 0, failed: failedIds };
      }
      if (action === 'finalize') {
        let requested = 0;
        const res = await runLimited(ids, 6, async (id) => { if ((await finalizeOne(id)) === 'requested') requested++; },
          (done) => setBusy(`Mengakhiri ${done}/${ids.length}…`));
        return { action, total: ids.length, requested, failed: res.failed };
      }
      // reset: hanya satu sesi per kali
      for (const id of ids) {
        const a = await (supabase as any).from('cbt_student_answers').delete().eq('session_id', id);
        if (a.error) throw a.error;
        const s = await (supabase as any).from('cbt_exam_sessions').delete().eq('id', id);
        if (s.error) throw s.error;
      }
      return { action, total: ids.length, requested: 0, failed: 0 };
    },
    onSuccess: (r) => {
      setBusy(null);
      refreshAll();
      if (r.failed > 0) toast.error(`${r.failed} sesi gagal diproses. Coba lagi.`);
      else if (r.action === 'finalize' && r.requested > 0) toast.info(`Permintaan kumpul dikirim ke ${r.requested} perangkat siswa. Jawaban masuk otomatis dalam ±1 menit; tekan Akhiri lagi bila belum selesai.`);
      else toast.success(`Berhasil untuk ${r.total} sesi`);
      if (r.action === 'reset') setSelected(new Set());
    },
    onError: (e: any) => { setBusy(null); toast.error(e?.message || 'Aksi gagal'); },
  });

  const ask = (title: string, desc: string, label: string, run: () => void, destructive = false) => setConfirmState({ title, desc, label, run, destructive });

  const onRowAction = useCallback((r: MonRow, a: SessionAction) => {
    if (!r.sessionId) return;
    const id = r.sessionId;
    if (a === 'pause') return runAction.mutate({ ids: [id], action: 'pause' });
    if (a === 'resume') return runAction.mutate({ ids: [id], action: 'resume' });
    if (a === 'finalize') {
      return ask(`Akhiri ujian ${r.name}?`,
        r.offline ? 'Siswa ini offline, jawabannya mungkin belum terkirim. Tunggu atau lanjutkan akhiri?' : 'Perangkat siswa diminta mengumpulkan jawabannya. Tidak bisa dibatalkan.',
        'Akhiri', () => runAction.mutate({ ids: [id], action: 'finalize' }), true);
    }
    return ask(`Reset sesi ${r.name}?`, 'Semua jawaban siswa ini dihapus dan sesinya dihapus. Siswa bisa memulai dari awal. Tidak bisa dibatalkan.', 'Reset', () => runAction.mutate({ ids: [id], action: 'reset' }), true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runAction]);

  const toggleRow = useCallback((r: MonRow) => {
    if (!r.sessionId) return;
    const id = r.sessionId;
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const pageSelectable = pageRows.filter((r) => r.sessionId);
  const allPageSelected = pageSelectable.length > 0 && pageSelectable.every((r) => selected.has(r.sessionId!));
  const togglePage = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allPageSelected) pageSelectable.forEach((r) => n.delete(r.sessionId!)); else pageSelectable.forEach((r) => n.add(r.sessionId!));
    return n;
  });
  const selectAllFiltered = () => setSelected(new Set(sorted.filter((r) => r.sessionId).map((r) => r.sessionId!)));

  const selectedRows = useMemo(() => rows.filter((r) => r.sessionId && selected.has(r.sessionId)), [rows, selected]);
  const bulk = (action: 'pause' | 'resume' | 'finalize') => {
    const eligible = selectedRows.filter((r) => (action === 'pause' ? r.status === 'mengerjakan' : action === 'resume' ? r.status === 'jeda' : r.status !== 'selesai'));
    if (!eligible.length) return toast.info(action === 'pause' ? 'Tidak ada sesi "Mengerjakan" di pilihan' : action === 'resume' ? 'Tidak ada sesi "Dijeda" di pilihan' : 'Semua sesi terpilih sudah selesai');
    const ids = eligible.map((r) => r.sessionId!);
    if (action === 'finalize') {
      const off = eligible.filter((r) => r.offline).length;
      return ask(`Akhiri ${ids.length} sesi?`,
        `Perangkat siswa diminta mengumpulkan jawabannya; siswa yang tidak aktif diakhiri langsung. Tidak bisa dibatalkan.${off ? ` ${off} siswa offline, jawaban mereka mungkin belum terkirim.` : ''}`,
        'Akhiri', () => runAction.mutate({ ids, action }), true);
    }
    return ask(`${action === 'pause' ? 'Jeda' : 'Lanjutkan'} ${ids.length} sesi?`, action === 'pause' ? 'Siswa terpilih yang sedang mengerjakan akan dijeda.' : 'Siswa terpilih yang dijeda akan melanjutkan ujian.',
      action === 'pause' ? 'Jeda' : 'Lanjutkan', () => runAction.mutate({ ids, action }));
  };

  // ---------------------------------------------------------------- tampilan
  const loadingFirst = (examsLoading || sessionsQ.isLoading) && !sessionsQ.data;
  const updatedAt = sessionsQ.dataUpdatedAt ? new Date(sessionsQ.dataUpdatedAt).toLocaleTimeString('id-ID') : '–';
  const rowProps = (r: MonRow): RowProps => ({
    r, totalQ, passScore: exam?.pass_score || 70, now, selected: !!r.sessionId && selected.has(r.sessionId), antiCheat,
    onToggle: toggleRow, onOpen: setDetail, onAction: onRowAction,
  });
  const doneRatio = summary.total ? Math.round((summary.selesai / summary.total) * 100) : 0;

  return (
    <ProtectedRoute allowedRoles={['teacher', 'admin', 'super_admin', 'panitia_ujian']}>
      <DashboardLayout>
        <div className="space-y-4 animate-fade-in">
          {/* Judul + pemilih ujian */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6 text-blue-600" /> Pantau CBT</h1>
              <p className="text-sm text-muted-foreground truncate">
                {exam ? <>{exam.subject}{exam.duration_minutes ? ` • ${exam.duration_minutes} menit` : ''}{totalQ ? ` • ${totalQ} soal` : ''}{exam.exam_token ? <> • Token <span className="font-mono">{exam.exam_token}</span></> : null}</> : 'Pilih ujian untuk mulai memantau'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={examId} onValueChange={selectExam} disabled={!sortedExams.length}>
                <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder={examsLoading ? 'Memuat ujian…' : 'Belum ada ujian'} /></SelectTrigger>
                <SelectContent>
                  {sortedExams.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.live ? '● ' : ''}{e.title}{e.subject ? ` — ${e.subject}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} /> Otomatis {POLL_MS / 1000} dtk
              </label>
              <Button size="sm" variant="outline" onClick={() => setPdfOpen(true)} disabled={!examId || loadingFirst || filtered.length === 0} title="Pratinjau / cetak PDF hasil ujian sesuai saringan">
                <Printer className="h-4 w-4 mr-1" /> Cetak PDF
              </Button>
              <Button size="sm" variant="outline" onClick={refreshAll} disabled={!examId || sessionsQ.isFetching}>
                {sessionsQ.isFetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-1" />} {updatedAt}
              </Button>
            </div>
          </div>

          {!examsLoading && !sortedExams.length && (
            <div className="text-center py-16 text-muted-foreground border rounded-xl bg-muted/20">Belum ada ujian CBT pada tahun ajaran ini.</div>
          )}

          {examId && (
            <>
              {/* Ringkasan (klik = saring) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <StatCard label="Semua" value={summary.total} tone="text-muted-foreground" icon={<Users className="h-3.5 w-3.5" />} active={filter.status === 'all' && !filter.onlyOffline && !filter.onlyViolations} onClick={() => { patchFilter({ status: 'all', onlyOffline: false, onlyViolations: false }); }} />
                <StatCard label="Belum mulai" value={summary.belum} tone="text-slate-600" icon={<Clock className="h-3.5 w-3.5" />} active={filter.status === 'belum'} onClick={() => patchFilter({ status: filter.status === 'belum' ? 'all' : 'belum' })} />
                <StatCard label="Mengerjakan" value={summary.mengerjakan} tone="text-blue-600" icon={<Activity className="h-3.5 w-3.5" />} active={filter.status === 'mengerjakan'} onClick={() => patchFilter({ status: filter.status === 'mengerjakan' ? 'all' : 'mengerjakan' })} />
                <StatCard label="Dijeda" value={summary.jeda} tone="text-amber-600" icon={<Pause className="h-3.5 w-3.5" />} active={filter.status === 'jeda'} onClick={() => patchFilter({ status: filter.status === 'jeda' ? 'all' : 'jeda' })} />
                <StatCard label="Selesai" value={summary.selesai} tone="text-emerald-600" icon={<CheckCircle2 className="h-3.5 w-3.5" />} active={filter.status === 'selesai'} onClick={() => patchFilter({ status: filter.status === 'selesai' ? 'all' : 'selesai' })} />
                <StatCard label="Offline" value={summary.offline} tone="text-destructive" icon={<WifiOff className="h-3.5 w-3.5" />} active={filter.onlyOffline} onClick={() => patchFilter({ onlyOffline: !filter.onlyOffline })} />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Progress value={doneRatio} className="h-1.5 flex-1" />
                <span className="whitespace-nowrap">{doneRatio}% selesai • rata-rata progres {summary.avgProgress}%{summary.perluKoreksi ? ` • ${summary.perluKoreksi} perlu koreksi` : ''}{antiCheat ? ` • ${summary.pelanggaran} siswa melanggar` : ''}</span>
              </div>

              {/* Filter & urut */}
              <div className="flex flex-col lg:flex-row gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Cari nama atau NIS…" className="pl-9" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={filter.classKey} onValueChange={(v) => patchFilter({ classKey: v })}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Kelas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua kelas</SelectItem>
                      {classOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filter.status} onValueChange={(v) => patchFilter({ status: v as MonFilter['status'] })}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua status</SelectItem>
                      {(Object.keys(STATUS_LABEL) as MonStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {antiCheat && (
                    <Button size="sm" variant={filter.onlyViolations ? 'default' : 'outline'} className="h-10" onClick={() => patchFilter({ onlyViolations: !filter.onlyViolations })}>
                      <ShieldAlert className="h-4 w-4 mr-1" /> Ada pelanggaran
                    </Button>
                  )}
                  <Select value={sort.key} onValueChange={(v) => { setSort({ key: v as SortKey, dir: 'asc' }); setPage(1); }}>
                    <SelectTrigger className="w-[170px]"><SelectValue placeholder="Urutkan" /></SelectTrigger>
                    <SelectContent>{SORT_OPTIONS.map((o) => <SelectItem key={o.key} value={o.key}>Urut: {o.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="icon" variant="outline" className="h-10 w-10" title={sort.dir === 'asc' ? 'Naik' : 'Turun'} onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}>
                    {sort.dir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </Button>
                  {isFilterActive(filter) && <Button variant="ghost" size="sm" className="h-10" onClick={resetFilter}><X className="h-4 w-4 mr-1" /> Reset</Button>}
                </div>
              </div>

              {/* Aksi massal untuk yang dipilih */}
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                  <span className="font-medium">{selected.size} dipilih</span>
                  {selected.size < sorted.filter((r) => r.sessionId).length && <button type="button" className="text-primary underline text-xs" onClick={selectAllFiltered}>Pilih semua hasil saringan ({sorted.filter((r) => r.sessionId).length})</button>}
                  <span className="flex-1" />
                  <Button size="sm" variant="outline" disabled={runAction.isPending} onClick={() => bulk('pause')}><Pause className="h-3.5 w-3.5 mr-1" /> Jeda</Button>
                  <Button size="sm" variant="outline" disabled={runAction.isPending} onClick={() => bulk('resume')}><Play className="h-3.5 w-3.5 mr-1" /> Lanjutkan</Button>
                  <Button size="sm" variant="destructive" disabled={runAction.isPending} onClick={() => bulk('finalize')}><Power className="h-3.5 w-3.5 mr-1" /> Akhiri</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Batal pilih</Button>
                  {busy && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {busy}</span>}
                </div>
              )}

              {sessionsQ.isError && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-center justify-between gap-2">
                  <span>Gagal memuat data pantauan: {(sessionsQ.error as any)?.message || 'kesalahan tidak dikenal'}</span>
                  <Button size="sm" variant="outline" onClick={() => sessionsQ.refetch()}>Coba lagi</Button>
                </div>
              )}

              {/* Daftar */}
              {loadingFirst ? (
                <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : sorted.length === 0 ? (
                <div className="text-center py-14 text-muted-foreground border rounded-xl bg-muted/20">
                  <Activity className="h-9 w-9 mx-auto mb-2 opacity-30" />
                  {rows.length === 0
                    ? <p>Belum ada peserta{classIds.length === 0 ? ' (ujian ini tidak terhubung ke kelas, hanya siswa yang sudah mulai akan muncul)' : ''}.</p>
                    : <p>Tidak ada siswa yang cocok dengan saringan.</p>}
                  {rows.length > 0 && <Button variant="link" onClick={resetFilter}>Reset saringan</Button>}
                </div>
              ) : (
                <>
                  <div className="hidden md:block rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"><Checkbox checked={allPageSelected} onCheckedChange={togglePage} aria-label="Pilih halaman ini" /></TableHead>
                          <SortHead label="Siswa" k="name" sort={sort} onSort={onSort} />
                          <SortHead label="Kelas" k="class" sort={sort} onSort={onSort} />
                          <SortHead label="Status" k="status" sort={sort} onSort={onSort} />
                          <SortHead label="Progres" k="progress" sort={sort} onSort={onSort} />
                          <SortHead label="Sisa" k="time" sort={sort} onSort={onSort} />
                          <SortHead label="Aktivitas" k="activity" sort={sort} onSort={onSort} />
                          {antiCheat && <SortHead label="Langgar" k="violations" sort={sort} onSort={onSort} />}
                          <SortHead label="Skor" k="score" sort={sort} onSort={onSort} />
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>{pageRows.map((r) => <TableRowView key={r.key} {...rowProps(r)} />)}</TableBody>
                    </Table>
                  </div>
                  <div className="md:hidden space-y-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={allPageSelected} onCheckedChange={togglePage} /> Pilih halaman ini</label>
                    {pageRows.map((r) => <CardRowView key={r.key} {...rowProps(r)} />)}
                  </div>
                  <DataPagination currentPage={safePage} totalPages={totalPages} totalItems={sorted.length} pageSize={pageSize}
                    onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} pageSizeOptions={PAGE_SIZES} />
                </>
              )}
            </>
          )}
        </div>

        <PdfPreviewDialog
          open={pdfOpen}
          onClose={() => setPdfOpen(false)}
          title={`Pratinjau Hasil Ujian${exam ? ' — ' + exam.title : ''}`}
          filename={exam ? reportFileName(exam) : 'Hasil_CBT.pdf'}
          build={buildPdf}
          rebuildKey={`${paper}|${order}|${place}|${signDate}`}
          toolbar={
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Isi mengikuti saringan yang sedang aktif ({filtered.length} siswa: {describeFilter(filter, (k) => classOptions.find(([id]) => id === k)?.[1])}). Data diambil saat pratinjau dibuka atau pengaturan diubah.
              </p>
              <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
                <div>
                  <Label className="text-xs">Kertas</Label>
                  <Select value={paper} onValueChange={(v) => setPaper(v as PdfPaper)}>
                    <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(PAPER_LABEL) as PdfPaper[]).map((k) => <SelectItem key={k} value={k}>{PAPER_LABEL[k]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Urutan</Label>
                  <Select value={order} onValueChange={(v) => setOrder(v as ReportOrder)}>
                    <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(ORDER_LABEL) as ReportOrder[]).map((k) => <SelectItem key={k} value={k}>{ORDER_LABEL[k]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Tempat titimangsa</Label>
                  <Input value={placeInput} maxLength={60} onChange={(e) => setPlaceInput(e.target.value)} placeholder="Ciamis" className="w-36 h-9" />
                </div>
                <div>
                  <Label className="text-xs">Tanggal titimangsa</Label>
                  <Input type="date" value={signDate} onChange={(e) => setSignDate(e.target.value)} className="w-40 h-9" />
                </div>
              </div>
            </div>
          }
        />

        <DetailSheet row={detail} exam={exam} totalQ={totalQ} now={now} onClose={() => setDetail(null)} onAction={(r, a) => { setDetail(null); onRowAction(r, a); }} />

        <AlertDialog open={!!confirmState} onOpenChange={(o) => { if (!o) setConfirmState(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmState?.desc}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction className={confirmState?.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
                onClick={() => { const run = confirmState?.run; setConfirmState(null); run?.(); }}>{confirmState?.label}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

function DetailSheet({ row, exam, totalQ, now, onClose, onAction }: { row: MonRow | null; exam: any; totalQ: number; now: number; onClose: () => void; onAction: (r: MonRow, a: SessionAction) => void }) {
  const sessionId = row?.sessionId || null;
  const lastIdRef = useRef<MonRow | null>(null);
  if (row) lastIdRef.current = row; // pertahankan isi saat animasi tutup
  const r = row || lastIdRef.current;
  const vq = useQuery({
    queryKey: ['cbt-monitor-violation-list', sessionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('cbt_session_violations')
        .select('id, violation_type, detail, created_at').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data || []) as { id: string; violation_type: string; detail: string | null; created_at: string }[];
    },
    enabled: !!sessionId && !!exam?.anti_cheat_enabled,
  });
  return (
    <Sheet open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {r && (
          <>
            <SheetHeader>
              <SheetTitle>{r.name}</SheetTitle>
              <SheetDescription>{r.nis} • {r.classLabel}</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4 text-sm">
              <div className="flex items-center gap-2"><StatusBadge r={r} />{r.remedial && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">Remidial</Badge>}<span className="text-xs text-muted-foreground">Percobaan #{r.attempt || 1}</span></div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Progres</dt><dd>{r.answered}/{totalQ} ({r.progress}%)</dd>
                <dt className="text-muted-foreground">Sisa waktu</dt><dd className="font-mono">{formatClock(r.timeLeft)}</dd>
                <dt className="text-muted-foreground">Mulai</dt><dd>{r.startMs ? new Date(r.startMs).toLocaleTimeString('id-ID') : '–'}</dd>
                <dt className="text-muted-foreground">Aktivitas</dt><dd className={r.offline && r.status !== 'selesai' ? 'text-destructive font-medium' : ''}>{formatAgo(r.lastActivityMs, now)}</dd>
                {r.status === 'selesai' && <><dt className="text-muted-foreground">Skor</dt><dd className="font-semibold">{r.score != null ? r.score.toFixed(1) : '–'}{r.needsGrading ? ' (perlu koreksi)' : ''}</dd></>}
              </dl>
              {exam?.anti_cheat_enabled && (
                <div>
                  <p className="font-medium mb-1 flex items-center gap-1"><ShieldAlert className="h-4 w-4" /> Pelanggaran ({r.violations}{exam?.max_violations ? ` / batas ${exam.max_violations}` : ''})</p>
                  {vq.isLoading ? <Skeleton className="h-16 w-full" /> : (vq.data || []).length === 0 ? <p className="text-xs text-muted-foreground">Tidak ada pelanggaran tercatat.</p> : (
                    <ul className="space-y-1 max-h-64 overflow-y-auto">
                      {(vq.data || []).map((v) => (
                        <li key={v.id} className="flex justify-between gap-2 text-xs border-b pb-1">
                          <span>{violationLabel(v.violation_type)}{v.detail ? <span className="text-muted-foreground"> — {v.detail}</span> : null}</span>
                          <span className="text-muted-foreground whitespace-nowrap">{new Date(v.created_at).toLocaleTimeString('id-ID')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {r.status === 'mengerjakan' && <Button size="sm" variant="outline" onClick={() => onAction(r, 'pause')}><Pause className="h-3.5 w-3.5 mr-1" /> Jeda</Button>}
                {r.status === 'jeda' && <Button size="sm" variant="outline" onClick={() => onAction(r, 'resume')}><Play className="h-3.5 w-3.5 mr-1" /> Lanjutkan</Button>}
                {r.status !== 'selesai' && <Button size="sm" variant="destructive" onClick={() => onAction(r, 'finalize')}><Power className="h-3.5 w-3.5 mr-1" /> Akhiri</Button>}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onAction(r, 'reset')}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset sesi</Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
