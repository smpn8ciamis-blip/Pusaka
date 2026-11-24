// src/pages/HomeroomAttendance.tsx
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import AbsenceNoticesCard from '@/components/homeroom/AbsenceNoticesCard';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserX,
  FileText,
  Download,
  Calendar,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Stethoscope,
  Plus,
  ClipboardCheck,
  Edit2,
  Save,
  X as XIcon,
  Info,
  Eye,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  GraduationCap,
  CalendarDays,
  SlidersHorizontal,
} from 'lucide-react';
import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { PdfPreviewDialog } from '@/components/piket/PdfPreviewDialog';
import { DataPagination } from '@/components/ui/data-pagination';
import { usePagination } from '@/components/ui/usePagination';
import { Checkbox } from '@/components/ui/checkbox';
import {
  buildHomeroomAttendancePdf,
  homeroomRecapFileName,
  toTitleCase,
} from '@/lib/homeroomAttendancePdf';
import { PAPER_LABEL, type PdfPaper } from '@/lib/pdfPaper';
import { notifyBotIfAttendanceComplete } from '@/lib/waBot';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { fetchAttendanceChunked } from '@/lib/fetchAttendanceRange';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ImportAttendance } from '@/components/ImportAttendance';
import { useAttendanceDaySettings, isAttendanceAllowedForDate, getActiveDayNames } from '@/hooks/useAttendanceDaySettings';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, format as formatDate, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

const COLORS = {
  hadir: '#10b981',
  sakit: '#f59e0b',
  izin: '#3b82f6',
  alpa: '#ef4444',
};

// ---------- Urutan, filter & tombol urut tabel ----------
type SortDir = 'asc' | 'desc';
interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}
type StudentSortKey = 'no' | 'nis' | 'name' | 'hadir' | 'sakit' | 'izin' | 'alpa' | 'total' | 'pct';
type HistorySortKey = 'date' | 'nis' | 'name' | 'status';
type StudentFilter = 'all' | 'alpa' | 'sakit' | 'izin' | 'nodata';

const STUDENT_FILTER_LABEL: Record<StudentFilter, string> = {
  all: 'Semua siswa',
  alpa: 'Pernah alpa',
  sakit: 'Pernah sakit',
  izin: 'Pernah izin',
  nodata: 'Belum ada data',
};
const NUMERIC_SORT_KEYS: string[] = ['hadir', 'sakit', 'izin', 'alpa', 'total', 'pct', 'date'];

const cmpText = (a: unknown, b: unknown) =>
  String(a ?? '').localeCompare(String(b ?? ''), 'id', { numeric: true, sensitivity: 'base' });

const nextSort = <K extends string>(prev: SortState<K>, key: K): SortState<K> =>
  prev.key === key
    ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: NUMERIC_SORT_KEYS.includes(key) ? 'desc' : 'asc' };

function SortHead<K extends string>({
  label,
  k,
  sort,
  onSort,
  className = '',
}: {
  label: string;
  k: K;
  sort: SortState<K>;
  onSort: (k: K) => void;
  className?: string;
}) {
  const active = sort.key === k;
  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
        title={`Urutkan berdasarkan ${label}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? '' : 'opacity-40'}`} />
      </button>
    </TableHead>
  );
}

// ---------- Elemen tampilan ----------
type StatusKey = 'hadir' | 'sakit' | 'izin' | 'alpa';
const STATUS_KEYS: StatusKey[] = ['hadir', 'sakit', 'izin', 'alpa'];
const STATUS_META: Record<
  StatusKey,
  { label: string; icon: typeof CheckCircle2; text: string; bg: string; solid: string; activeBtn: string }
> = {
  hadir: {
    label: 'Hadir', icon: CheckCircle2,
    text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', solid: 'bg-emerald-500',
    activeBtn: 'bg-emerald-500 text-white border-emerald-500 shadow-sm',
  },
  sakit: {
    label: 'Sakit', icon: Stethoscope,
    text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', solid: 'bg-amber-500',
    activeBtn: 'bg-amber-500 text-white border-amber-500 shadow-sm',
  },
  izin: {
    label: 'Izin', icon: Clock,
    text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10', solid: 'bg-blue-500',
    activeBtn: 'bg-blue-500 text-white border-blue-500 shadow-sm',
  },
  alpa: {
    label: 'Alpa', icon: XCircle,
    text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', solid: 'bg-red-500',
    activeBtn: 'bg-red-500 text-white border-red-500 shadow-sm',
  },
};

const initialsOf = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

const pctTone = (pct: number) =>
  pct >= 90 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 75 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
const pctBar = (pct: number) => (pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : 'bg-red-500');

const fmtDay = (iso: string) => {
  try {
    return formatDate(parseISO(iso), 'd MMM yyyy', { locale: idLocale });
  } catch {
    return iso;
  }
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status as StatusKey];
  if (!m) return <span className="capitalize">{status}</span>;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${m.bg} ${m.text}`}>
      <Icon className="h-3.5 w-3.5" />
      {m.label}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {initialsOf(name)}
    </span>
  );
}

function StatCard({ kind, value, total }: { kind: StatusKey; value: number; total: number }) {
  const m = STATUS_META[kind];
  const Icon = m.icon;
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md md:p-4">
      <div className={`absolute inset-x-0 top-0 h-1 ${m.solid}`} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground md:text-sm">{m.label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${m.bg} ${m.text}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums md:text-3xl">{value}</span>
        <span className={`text-xs font-medium ${m.text}`}>{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${m.solid}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AttendanceRing({ pct, size = 88 }: { pct: number | null; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const color = pct == null ? 'stroke-muted-foreground/30' : v >= 90 ? 'stroke-emerald-500' : v >= 75 ? 'stroke-amber-500' : 'stroke-red-500';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={pct == null ? 'Belum ada data kehadiran' : `Tingkat kehadiran ${v.toFixed(1)} persen`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={`${color} transition-all duration-700`} strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-tight">
        <div>
          <div className="text-lg font-bold tabular-nums">{pct == null ? '-' : `${v.toFixed(0)}%`}</div>
          <div className="text-[10px] text-muted-foreground">hadir</div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title, description, action, children,
}: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden rounded-xl border shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 p-4 pb-2 md:p-6 md:pb-3">
        <div>
          <CardTitle className="text-base md:text-lg">{title}</CardTitle>
          {description && <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-3 pt-1 md:p-6 md:pt-2">{children}</CardContent>
    </Card>
  );
}

const PDF_PREFS_KEY = 'pusaka.homeroomRecap.pdfPrefs';
const loadPdfPrefs = (): { place: string; paper: PdfPaper } => {
  const d = { place: 'Ciamis', paper: 'a4' as PdfPaper };
  try {
    const raw = JSON.parse(localStorage.getItem(PDF_PREFS_KEY) || '{}');
    return {
      place: typeof raw.place === 'string' ? raw.place : d.place,
      paper: raw.paper === 'f4' ? 'f4' : 'a4',
    };
  } catch {
    return d;
  }
};

// Editable row component for homeroom teachers
const EditableAttendanceRow = ({ record, onUpdate }: { record: any; onUpdate: () => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedStatus, setEditedStatus] = useState(record.status);
  const [editedNotes, setEditedNotes] = useState(record.notes || '');

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('attendance')
        .update({
          status: editedStatus,
          notes: editedNotes || null,
        })
        .eq('id', record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Absensi berhasil diperbarui');
      setIsEditing(false);
      onUpdate();
    },
    onError: (error: any) => {
      toast.error(`Gagal memperbarui absensi: ${error.message}`);
    },
  });

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>{record.date}</TableCell>
        <TableCell>{record.students?.nis}</TableCell>
        <TableCell>{toTitleCase(record.students?.full_name || '')}</TableCell>
        <TableCell>
          <Select value={editedStatus} onValueChange={setEditedStatus}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hadir">Hadir</SelectItem>
              <SelectItem value="sakit">Sakit</SelectItem>
              <SelectItem value="izin">Izin</SelectItem>
              <SelectItem value="alpa">Alpa</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          <Input
            value={editedNotes}
            onChange={(e) => setEditedNotes(e.target.value)}
            placeholder="Catatan"
            className="w-full"
          />
        </TableCell>
        <TableCell>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              <Save className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setEditedStatus(record.status);
                setEditedNotes(record.notes || '');
              }}
            >
              <XIcon className="w-4 h-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell className="whitespace-nowrap text-xs md:text-sm">{fmtDay(record.date)}</TableCell>
      <TableCell className="text-xs text-muted-foreground md:text-sm">{record.students?.nis}</TableCell>
      <TableCell className="text-xs font-medium md:text-sm">{toTitleCase(record.students?.full_name || '')}</TableCell>
      <TableCell>
        <StatusBadge status={record.status} />
      </TableCell>
      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground md:text-sm" title={record.notes || ''}>{record.notes || '-'}</TableCell>
      <TableCell>
        <Button size="sm" variant="ghost" aria-label="Ubah absensi" onClick={() => setIsEditing(true)}>
          <Edit2 className="w-4 h-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
};

const HomeroomAttendance = () => {
  const { user } = useAuth();
  const { selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();
  const [filterStartDate, setFilterStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterEndDate, setFilterEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState<Record<string, { status: string; notes: string }>>({});
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Fetch attendance day settings
  const { data: attendanceDaySettings } = useAttendanceDaySettings();
  const isDayAllowed = isAttendanceAllowedForDate(selectedDate, attendanceDaySettings);
  const activeDayNames = getActiveDayNames(attendanceDaySettings);

  // Quick filter handlers
  const handleThisWeek = () => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    setFilterStartDate(start.toISOString().split('T')[0]);
    setFilterEndDate(end.toISOString().split('T')[0]);
  };

  const handleThisMonth = () => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    setFilterStartDate(start.toISOString().split('T')[0]);
    setFilterEndDate(end.toISOString().split('T')[0]);
  };

  const handleMonthSelect = (month: string) => {
    setSelectedMonth(month);
    if (month && selectedYear) {
      const monthNum = parseInt(month);
      const year = parseInt(selectedYear.split('/')[0]);
      const date = new Date(year, monthNum - 1, 1);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      setFilterStartDate(start.toISOString().split('T')[0]);
      setFilterEndDate(end.toISOString().split('T')[0]);
    }
  };

  // Get teacher info (id + school_id)
  const { data: teacherInfo } = useQuery({
    queryKey: ['teacher-info-homeroom', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('id, school_id, nip')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Nama wali kelas (untuk tanda tangan di PDF)
  const { data: myProfile } = useQuery({
    queryKey: ['homeroom-profile-name', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user!.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  // Get teacher's homeroom class
  const { data: homeroomClass } = useQuery({
    queryKey: ['homeroom-class', user?.id, selectedYear],
    queryFn: async () => {
      if (!selectedYear) return null;

      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (!teacher) return null;

      const { data: classData, error } = await supabase
        .from('classes')
        .select('*')
        .eq('homeroom_teacher_id', teacher.id)
        .eq('academic_year', selectedYear)
        .maybeSingle();

      if (error) throw error;
      return classData;
    },
    enabled: !!user?.id,
  });

  // Get students from homeroom class (hanya siswa aktif)
  const { data: students } = useQuery({
    queryKey: ['homeroom-students', homeroomClass?.id],
    queryFn: async () => {
      if (!homeroomClass?.id) return [];

      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', homeroomClass.id)
        // Siswa mutasi/nonaktif/alumni tidak ikut diabsen (sama seperti halaman Absensi per jam)
        .eq('status', 'aktif')
        .eq('is_alumni', false)
        .order('full_name');

      if (error) throw error;
      return data;
    },
    enabled: !!homeroomClass?.id,
  });

  // Get attendance records for the homeroom class
  const { data: attendanceRecords, error: attendanceError } = useQuery({
    queryKey: ['homeroom-attendance', homeroomClass?.id, filterStartDate, filterEndDate],
    queryFn: async () => {
      if (!homeroomClass?.id) return [];

      const studentIds = students?.map((s) => s.id) || [];
      if (studentIds.length === 0) return [];

      // Rentang panjang diambil per potongan 3 hari + percobaan ulang (lihat fetchAttendanceRange.ts).
      const rows: any[] = await fetchAttendanceChunked<any>(filterStartDate, filterEndDate, async (cs, ce, from, to) => {
        const { data, error } = await supabase
          .from('attendance')
          .select(
            `
          *,
          students (
            id,
            full_name,
            nis
          )
        `
          )
          .in('student_id', studentIds)
          .gte('date', cs)
          .lte('date', ce)
          .order('date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data || [];
      });
      return rows;
    },
    enabled: !!homeroomClass?.id && !!students,
  });

  React.useEffect(() => {
    if (attendanceError) {
      toast.error('Gagal memuat data absensi untuk rentang tanggal ini. Periksa koneksi lalu coba lagi, atau persempit rentang tanggal.');
      console.error('Gagal memuat absensi:', attendanceError);
    }
  }, [attendanceError]);

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings-letterhead'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_school_settings_for_letterhead');
      if (error) throw error;
      return (data ?? null) as any;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Deduplicate records
  const deduplicatedRecords = useMemo(() => {
    if (!attendanceRecords) return [];

    const recordMap = new Map<string, any>();
    const sortedRecords = [...attendanceRecords].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    sortedRecords.forEach((record) => {
      const key = `${record.student_id}-${record.date}`;
      if (!recordMap.has(key)) {
        recordMap.set(key, record);
      }
    });

    return Array.from(recordMap.values());
  }, [attendanceRecords]);

  // Calculate statistics
  const stats = useMemo(() => {
    return {
      hadir: deduplicatedRecords.filter((r) => r.status === 'hadir').length,
      izin: deduplicatedRecords.filter((r) => r.status === 'izin').length,
      sakit: deduplicatedRecords.filter((r) => r.status === 'sakit').length,
      alpa: deduplicatedRecords.filter((r) => r.status === 'alpa').length,
    };
  }, [deduplicatedRecords]);

  // Calculate per-student statistics
  const studentStats = useMemo(() => {
    if (!students) return [];

    return students.map((student) => {
      const studentRecords = deduplicatedRecords.filter((r) => r.student_id === student.id);
      return {
        ...student,
        hadir: studentRecords.filter((r) => r.status === 'hadir').length,
        sakit: studentRecords.filter((r) => r.status === 'sakit').length,
        izin: studentRecords.filter((r) => r.status === 'izin').length,
        alpa: studentRecords.filter((r) => r.status === 'alpa').length,
        total: studentRecords.length,
      };
    });
  }, [students, deduplicatedRecords]);

  const chartData = [
    { name: 'Hadir', value: stats.hadir, color: COLORS.hadir },
    { name: 'Izin', value: stats.izin, color: COLORS.izin },
    { name: 'Sakit', value: stats.sakit, color: COLORS.sakit },
    { name: 'Alpa', value: stats.alpa, color: COLORS.alpa },
  ];

  const barChartData = [
    { status: 'Hadir', jumlah: stats.hadir },
    { status: 'Izin', jumlah: stats.izin },
    { status: 'Sakit', jumlah: stats.sakit },
    { status: 'Alpa', jumlah: stats.alpa },
  ];

  // ---------- Rekap per siswa: filter, urut, halaman ----------
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState<StudentFilter>('all');
  const [studentSort, setStudentSort] = useState<SortState<StudentSortKey>>({ key: 'no', dir: 'asc' });

  const studentRows = useMemo(
    () =>
      studentStats.map((s, i) => ({
        ...s,
        order: i,
        pct: s.total > 0 ? (s.hadir / s.total) * 100 : -1,
      })),
    [studentStats]
  );

  const visibleStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const rows = studentRows.filter((s) => {
      if (q && !`${s.full_name ?? ''} ${s.nis ?? ''} ${s.nisn ?? ''}`.toLowerCase().includes(q)) return false;
      if (studentFilter === 'alpa') return s.alpa > 0;
      if (studentFilter === 'sakit') return s.sakit > 0;
      if (studentFilter === 'izin') return s.izin > 0;
      if (studentFilter === 'nodata') return s.total === 0;
      return true;
    });
    const sign = studentSort.dir === 'asc' ? 1 : -1;
    const k = studentSort.key;
    return [...rows].sort((a, b) => {
      let c = 0;
      if (k === 'no') c = a.order - b.order;
      else if (k === 'nis') c = cmpText(a.nis, b.nis);
      else if (k === 'name') c = cmpText(a.full_name, b.full_name);
      else c = (a[k] as number) - (b[k] as number);
      return c === 0 ? a.order - b.order : c * sign;
    });
  }, [studentRows, studentSearch, studentFilter, studentSort]);

  const studentPager = usePagination(visibleStudents, 10);
  useEffect(() => {
    studentPager.setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentSearch, studentFilter, studentSort]);
  const studentFilterActive = studentSearch.trim() !== '' || studentFilter !== 'all';

  // ---------- Riwayat absensi: filter, urut, halaman ----------
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState<'all' | 'hadir' | 'sakit' | 'izin' | 'alpa'>('all');
  const [historySort, setHistorySort] = useState<SortState<HistorySortKey>>({ key: 'date', dir: 'desc' });

  const visibleHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const rows = deduplicatedRecords.filter((r) => {
      if (historyStatus !== 'all' && r.status !== historyStatus) return false;
      if (q && !`${r.students?.full_name ?? ''} ${r.students?.nis ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const sign = historySort.dir === 'asc' ? 1 : -1;
    const k = historySort.key;
    // sort stabil: data dengan nilai sama tetap berurutan menurut waktu input terbaru
    return [...rows].sort((a, b) => {
      const c =
        k === 'date'
          ? cmpText(a.date, b.date)
          : k === 'nis'
          ? cmpText(a.students?.nis, b.students?.nis)
          : k === 'name'
          ? cmpText(a.students?.full_name, b.students?.full_name)
          : cmpText(a.status, b.status);
      return c * sign;
    });
  }, [deduplicatedRecords, historySearch, historyStatus, historySort]);

  const historyPager = usePagination(visibleHistory, 10);
  useEffect(() => {
    historyPager.setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySearch, historyStatus, historySort]);
  const historyFilterActive = historySearch.trim() !== '' || historyStatus !== 'all';

  // ---------- Pratinjau PDF (titimangsa + tanda tangan wali kelas) ----------
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfPrefs, setPdfPrefs] = useState(loadPdfPrefs);
  const [signDate, setSignDate] = useState(() => formatDate(new Date(), 'yyyy-MM-dd'));
  const [pdfOnlyFiltered, setPdfOnlyFiltered] = useState(false);
  const patchPdfPrefs = (p: Partial<{ place: string; paper: PdfPaper }>) =>
    setPdfPrefs((prev) => {
      const next = { ...prev, ...p };
      try {
        localStorage.setItem(PDF_PREFS_KEY, JSON.stringify(next));
      } catch {
        /* penyimpanan browser bisa diblokir; abaikan */
      }
      return next;
    });

  const pdfStudents = pdfOnlyFiltered ? visibleStudents : studentRows;
  const pdfRebuildKeyRaw = [
    pdfPrefs.place,
    pdfPrefs.paper,
    signDate,
    pdfOnlyFiltered,
    pdfStudents.map((s) => s.id).join(','),
    filterStartDate,
    filterEndDate,
    !!schoolSettings,
    teacherInfo?.nip ?? '',
    myProfile?.full_name ?? '',
  ].join('|');
  // Tunda pembuatan ulang PDF saat mengetik (kop & logo berat dimuat ulang tiap kali)
  const [pdfRebuildKey, setPdfRebuildKey] = useState(pdfRebuildKeyRaw);
  useEffect(() => {
    const t = setTimeout(() => setPdfRebuildKey(pdfRebuildKeyRaw), 500);
    return () => clearTimeout(t);
  }, [pdfRebuildKeyRaw]);

  const buildRecapPdf = async () => {
    if (!homeroomClass) throw new Error('Kelas wali belum dimuat.');
    if (!schoolSettings) throw new Error('Pengaturan sekolah belum dimuat. Tutup lalu coba lagi sebentar lagi.');
    const total = studentRows.length;
    return buildHomeroomAttendancePdf(
      {
        className: homeroomClass.name,
        homeroomName: myProfile?.full_name,
        homeroomNip: teacherInfo?.nip,
        startDate: filterStartDate,
        endDate: filterEndDate,
        students: pdfStudents.map((s) => ({
          id: s.id,
          nisn: s.nisn,
          nis: s.nis,
          name: s.full_name,
          hadir: s.hadir,
          sakit: s.sakit,
          izin: s.izin,
          alpa: s.alpa,
          total: s.total,
        })),
        records: deduplicatedRecords.map((r) => ({ student_id: r.student_id, date: r.date, status: r.status })),
        place: pdfPrefs.place,
        signDate,
        paper: pdfPrefs.paper,
        note: pdfOnlyFiltered && pdfStudents.length !== total ? `Hanya ${pdfStudents.length} dari ${total} siswa (sesuai filter).` : undefined,
      },
      schoolSettings as never
    );
  };

  const openPdfPreview = () => {
    if (!homeroomClass || !students) return;
    if (!schoolSettings) {
      toast.error('Pengaturan sekolah belum dimuat. Silakan coba lagi.');
      return;
    }
    setPreviewOpen(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'hadir':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'sakit':
        return <Stethoscope className="w-4 h-4 text-orange-500" />;
      case 'izin':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'alpa':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const createAttendanceMutation = useMutation({
    mutationFn: async (attendanceList: any[]) => {
      console.log('=== START createAttendanceMutation ===');
      console.log('Upserting attendance records:', attendanceList.length);

      const { data, error } = await supabase
        .from('attendance')
        .upsert(attendanceList, {
          onConflict: 'schedule_id,student_id,date',
          ignoreDuplicates: false,
        })
        .select();

      console.log('Upsert result:', { data, error });

      if (error) {
        console.error('Upsert error:', error);
        throw error;
      }

      if (homeroomClass) {
        const channel = supabase.channel('attendance-notifications');
        await channel.send({
          type: 'broadcast',
          event: 'homeroom-attendance-filled',
          payload: {
            classId: homeroomClass.id,
            className: homeroomClass.name,
            date: selectedDate,
            teacherName: user?.email,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const selectedDayOfWeek = new Date(selectedDate).getDay();
      const { data: todaySchedules } = await supabase
        .from('schedules')
        .select('teacher_id, subject')
        .eq('class_id', homeroomClass?.id)
        .eq('day_of_week', selectedDayOfWeek);

      if (todaySchedules && todaySchedules.length > 0) {
        const notifications = todaySchedules
          .filter((s) => s.teacher_id)
          .map((schedule) => ({
            teacher_id: schedule.teacher_id,
            student_id: null,
            message: `Absensi kelas ${homeroomClass?.name} telah diisi wali kelas dan otomatis tercatat pada jadwal ${schedule.subject}. Anda dapat mengubahnya bila ada siswa yang berbeda.`,
            type: 'attendance_ready',
            is_read: false,
          }));

        if (notifications.length > 0) {
          await supabase.from('notifications').insert(notifications);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homeroom-attendance'] });
      toast.success('✓ Absensi berhasil disimpan dan notifikasi dikirim ke guru mapel');
      notifyBotIfAttendanceComplete(selectedDate);
      setIsDialogOpen(false);
      setAttendanceData({});
    },
    onError: (error: any) => {
      console.error('Error saving attendance:', error);
      toast.error(`Gagal menyimpan absensi: ${error.message}`);
    },
  });

  const handleSubmitAttendance = async () => {
    console.log('=== START handleSubmitAttendance ===');

    if (!isAttendanceAllowedForDate(selectedDate, attendanceDaySettings)) {
      toast.error(
        `Absensi tidak dapat diisi pada hari yang dipilih. Hari yang diizinkan: ${activeDayNames.join(', ')}`
      );
      return;
    }

    if (!students || students.length === 0) {
      toast.error('Tidak ada siswa dalam kelas ini');
      return;
    }

    if (!homeroomClass) {
      toast.error('Data kelas tidak ditemukan');
      return;
    }

    if (!user?.id) {
      toast.error('User tidak teridentifikasi');
      return;
    }

    try {
      const selectedDayOfWeek = new Date(selectedDate).getDay();

      const { data: classSchedules, error: scheduleError } = await supabase
        .from('schedules')
        .select('id, start_time, subject')
        .eq('class_id', homeroomClass.id)
        .eq('is_active', true)
        .eq('day_of_week', selectedDayOfWeek)
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (scheduleError) throw scheduleError;

      let scheduleId = classSchedules?.id;

      if (!scheduleId) {
        const { data: anySchedule, error: anyScheduleError } = await supabase
          .from('schedules')
          .select('id, subject')
          .eq('class_id', homeroomClass.id)
          .limit(1)
          .maybeSingle();

        if (anyScheduleError) throw anyScheduleError;
        scheduleId = anySchedule?.id;

        if (!scheduleId) {
          toast.error('Tidak ada jadwal untuk kelas ini. Silakan tambahkan jadwal terlebih dahulu.');
          return;
        }
      }

      const attendanceList = students.map((student) => {
        const status = attendanceData[student.id]?.status || 'hadir';
        const notes = attendanceData[student.id]?.notes || null;

        return {
          schedule_id: scheduleId,
          student_id: student.id,
          date: selectedDate,
          status: status.toLowerCase(),
          notes: notes,
          created_by: user?.id,
        };
      });

      createAttendanceMutation.mutate(attendanceList);
    } catch (error: any) {
      console.error('Error preparing attendance:', error);
      toast.error(`Gagal mempersiapkan data absensi: ${error.message}`);
    }
  };

  const updateAttendanceStatus = (studentId: string, status: string) => {
    setAttendanceData((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], status },
    }));
  };

  const updateAttendanceNotes = (studentId: string, notes: string) => {
    setAttendanceData((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], notes },
    }));
  };

  const quickMarkAll = (status: string) => {
    if (!students) return;
    const newData: Record<string, { status: string; notes: string }> = {};
    students.forEach((s) => {
      newData[s.id] = { status, notes: '' };
    });
    setAttendanceData(newData);
    toast.success(`Semua siswa ditandai ${status}`);
  };

  // Nilai turunan untuk tampilan
  const totalRecords = stats.hadir + stats.sakit + stats.izin + stats.alpa;
  const ratePct = totalRecords > 0 ? (stats.hadir / totalRecords) * 100 : null;
  const periodText =
    filterStartDate === filterEndDate ? fmtDay(filterStartDate) : `${fmtDay(filterStartDate)} – ${fmtDay(filterEndDate)}`;
  const dialogCounts = STATUS_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<StatusKey, number>
  );
  (students || []).forEach((st) => {
    const cur = (attendanceData[st.id]?.status || 'hadir') as StatusKey;
    if (cur in dialogCounts) dialogCounts[cur] += 1;
  });

  if (!homeroomClass) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">Anda tidak terdaftar sebagai wali kelas.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        {/* HEADER */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4 md:p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:grid">
                <GraduationCap className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Wali Kelas</p>
                <h1 className="text-xl font-bold md:text-3xl">Absensi Kelas {homeroomClass.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs md:text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {students?.length ?? 0} siswa
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    {periodText}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-3">
                <AttendanceRing pct={ratePct} />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Tingkat kehadiran</p>
                  <p>{totalRecords} catatan pada periode ini</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <ImportAttendance />
                <Dialog
                  open={isDialogOpen}
                  onOpenChange={(open) => {
                    if (open && !isDayAllowed) {
                      toast.error(
                        `Absensi tidak dapat diisi pada hari ini. Hari yang diizinkan: ${activeDayNames.join(', ')}`
                      );
                      return;
                    }
                    setIsDialogOpen(open);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button className="shadow-sm" size="sm">
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Absensi Hari Ini</span>
                      <span className="sm:hidden">Absensi</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
                    <DialogHeader className="border-b p-4 text-left md:p-6">
                      <DialogTitle className="flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                        Input Absensi Kelas {homeroomClass.name}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
                      <Alert className="border-primary/20 bg-primary/5">
                        <Info className="h-4 w-4 text-primary" />
                        <AlertDescription className="text-sm">
                          <strong>Sistem Hybrid:</strong> Anda yang pertama mengabsen hari ini akan menjadi data default
                          untuk guru mata pelajaran. Mereka dapat mengubah status jika diperlukan.
                        </AlertDescription>
                      </Alert>

                      <div className="grid gap-3 sm:grid-cols-[200px_1fr] sm:items-end">
                        <div>
                          <Label className="text-xs">Tanggal</Label>
                          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {STATUS_KEYS.map((k) => (
                            <Button
                              key={k}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => quickMarkAll(k)}
                              className={STATUS_META[k].text}
                            >
                              Semua {STATUS_META[k].label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2" aria-live="polite">
                        {STATUS_KEYS.map((k) => (
                          <div key={k} className={`rounded-lg px-2 py-2 text-center ${STATUS_META[k].bg}`}>
                            <div className={`text-lg font-bold tabular-nums ${STATUS_META[k].text}`}>{dialogCounts[k]}</div>
                            <div className="text-[11px] text-muted-foreground">{STATUS_META[k].label}</div>
                          </div>
                        ))}
                      </div>

                      <div className="divide-y rounded-xl border">
                        {students?.map((student, idx) => {
                          const cur = (attendanceData[student.id]?.status || 'hadir') as StatusKey;
                          return (
                            <div key={student.id} className="space-y-2 p-3 md:p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{idx + 1}</span>
                                  <Avatar name={student.full_name} />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{toTitleCase(student.full_name)}</p>
                                    <p className="text-xs text-muted-foreground">NIS: {student.nis}</p>
                                  </div>
                                </div>
                                <div
                                  role="radiogroup"
                                  aria-label={`Status ${student.full_name}`}
                                  className="grid grid-cols-4 gap-1.5 sm:w-72"
                                >
                                  {STATUS_KEYS.map((k) => {
                                    const sel = cur === k;
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        role="radio"
                                        aria-checked={sel}
                                        onClick={() => updateAttendanceStatus(student.id, k)}
                                        className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                          sel ? STATUS_META[k].activeBtn : 'bg-background text-muted-foreground hover:bg-muted'
                                        }`}
                                      >
                                        {STATUS_META[k].label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <Input
                                placeholder="Catatan (opsional)"
                                value={attendanceData[student.id]?.notes || ''}
                                onChange={(e) => updateAttendanceNotes(student.id, e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t bg-background p-3 md:p-4">
                      <Button
                        onClick={handleSubmitAttendance}
                        className="w-full"
                        disabled={createAttendanceMutation.isPending}
                      >
                        {createAttendanceMutation.isPending ? 'Menyimpan...' : 'Simpan Absensi'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </div>

        {/* Pemberitahuan izin/sakit dari orang tua (WhatsApp): foto surat + ACC/Tolak */}
        <AbsenceNoticesCard />

        {/* Data siswa & akun dipindah ke menu Akun Siswa (/akun-siswa) */}
        <Tabs defaultValue="attendance" className="space-y-4">
          {/* ============ TAB ABSENSI ============ */}
          <TabsContent value="attendance" className="space-y-4 md:space-y-6">
            {/* Filter Periode */}
            <SectionCard title="Periode Rekap" description="Pilih rentang tanggal untuk statistik, tabel, dan PDF rekap.">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Cepat:
                  </span>
                  <Button onClick={handleThisWeek} variant="secondary" size="sm" className="h-8 rounded-full">
                    Minggu Ini
                  </Button>
                  <Button onClick={handleThisMonth} variant="secondary" size="sm" className="h-8 rounded-full">
                    Bulan Ini
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                  <div>
                    <Label className="text-xs">Bulan</Label>
                    <Select value={selectedMonth} onValueChange={handleMonthSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih bulan..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Januari</SelectItem>
                        <SelectItem value="2">Februari</SelectItem>
                        <SelectItem value="3">Maret</SelectItem>
                        <SelectItem value="4">April</SelectItem>
                        <SelectItem value="5">Mei</SelectItem>
                        <SelectItem value="6">Juni</SelectItem>
                        <SelectItem value="7">Juli</SelectItem>
                        <SelectItem value="8">Agustus</SelectItem>
                        <SelectItem value="9">September</SelectItem>
                        <SelectItem value="10">Oktober</SelectItem>
                        <SelectItem value="11">November</SelectItem>
                        <SelectItem value="12">Desember</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Tanggal Mulai</Label>
                    <Input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => {
                        setFilterStartDate(e.target.value);
                        setSelectedMonth('');
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Tanggal Akhir</Label>
                    <Input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => {
                        setFilterEndDate(e.target.value);
                        setSelectedMonth('');
                      }}
                    />
                  </div>
                  <Button onClick={openPdfPreview} variant="outline" className="sm:col-span-2 lg:col-span-1">
                    <Eye className="mr-2 h-4 w-4" />
                    Pratinjau PDF
                  </Button>
                </div>
              </div>
            </SectionCard>

            {/* Statistik */}
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
              {STATUS_KEYS.map((k) => (
                <StatCard key={k} kind={k} value={stats[k]} total={totalRecords} />
              ))}
            </div>

            {/* Grafik */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SectionCard title="Distribusi Kehadiran">
                {totalRecords === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data pada periode ini.</p>
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <div className="relative h-48 w-48 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData.filter((d) => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={56}
                            outerRadius={84}
                            paddingAngle={3}
                            cornerRadius={4}
                            dataKey="value"
                            stroke="none"
                          >
                            {chartData
                              .filter((d) => d.value > 0)
                              .map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                        <div>
                          <div className="text-2xl font-bold tabular-nums">{totalRecords}</div>
                          <div className="text-[11px] text-muted-foreground">catatan</div>
                        </div>
                      </div>
                    </div>
                    <ul className="w-full space-y-2 text-sm">
                      {STATUS_KEYS.map((k) => (
                        <li key={k} className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[k].solid}`} />
                            {STATUS_META[k].label}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            <b className="text-foreground">{stats[k]}</b> · {Math.round((stats[k] / totalRecords) * 100)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Grafik Kehadiran">
                {totalRecords === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data pada periode ini.</p>
                ) : (
                  <div className="h-52 md:h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                        <XAxis dataKey="status" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                        <Bar dataKey="jumlah" radius={[8, 8, 0, 0]} maxBarSize={48}>
                          {barChartData.map((d) => (
                            <Cell key={d.status} fill={COLORS[d.status.toLowerCase() as StatusKey]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Rekap per siswa */}
            <SectionCard title="Rekap Per Siswa" description={`${studentPager.totalItems} siswa ditampilkan`}>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Cari nama / NIS / NISN…"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                  />
                </div>
                <Select value={studentFilter} onValueChange={(v) => setStudentFilter(v as StudentFilter)}>
                  <SelectTrigger className="sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STUDENT_FILTER_LABEL) as StudentFilter[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {STUDENT_FILTER_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={studentSort.key}
                  onValueChange={(v) =>
                    setStudentSort({ key: v as StudentSortKey, dir: NUMERIC_SORT_KEYS.includes(v) ? 'desc' : 'asc' })
                  }
                >
                  <SelectTrigger className="md:hidden">
                    <SelectValue placeholder="Urutkan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Urut: Nomor</SelectItem>
                    <SelectItem value="name">Urut: Nama</SelectItem>
                    <SelectItem value="alpa">Urut: Alpa terbanyak</SelectItem>
                    <SelectItem value="sakit">Urut: Sakit terbanyak</SelectItem>
                    <SelectItem value="izin">Urut: Izin terbanyak</SelectItem>
                    <SelectItem value="pct">Urut: Persentase hadir</SelectItem>
                  </SelectContent>
                </Select>
                {studentFilterActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStudentSearch('');
                      setStudentFilter('all');
                    }}
                  >
                    <XIcon className="mr-1 h-4 w-4" />
                    Reset
                  </Button>
                )}
              </div>

              {/* Ponsel: kartu */}
              <div className="space-y-2 md:hidden">
                {studentPager.paginatedItems.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {studentFilterActive ? 'Tidak ada siswa yang cocok dengan filter.' : 'Belum ada siswa.'}
                  </p>
                )}
                {studentPager.paginatedItems.map((student, index) => {
                  const pct = student.total > 0 ? (student.hadir / student.total) * 100 : null;
                  return (
                    <div key={student.id} className="rounded-xl border p-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={student.full_name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {(studentPager.currentPage - 1) * studentPager.pageSize + index + 1}. {toTitleCase(student.full_name)}
                          </p>
                          <p className="text-xs text-muted-foreground">NIS {student.nis}</p>
                        </div>
                        <div className={`text-right text-sm font-semibold tabular-nums ${pct == null ? 'text-muted-foreground' : pctTone(pct)}`}>
                          {pct == null ? '-' : `${pct.toFixed(1)}%`}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                        {STATUS_KEYS.map((k) => (
                          <div key={k} className={`rounded-md py-1 ${STATUS_META[k].bg}`}>
                            <div className={`text-sm font-semibold tabular-nums ${STATUS_META[k].text}`}>{student[k]}</div>
                            <div className="text-[10px] text-muted-foreground">{STATUS_META[k].label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Layar lebar: tabel */}
              <div className="hidden overflow-x-auto rounded-xl border md:block">
                <Table className="min-w-[640px]">
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <SortHead label="No" k="no" sort={studentSort} onSort={(k) => setStudentSort((p) => nextSort(p, k))} className="w-12 text-xs md:text-sm" />
                      <SortHead label="Siswa" k="name" sort={studentSort} onSort={(k) => setStudentSort((p) => nextSort(p, k))} className="text-xs md:text-sm" />
                      <SortHead label="NIS" k="nis" sort={studentSort} onSort={(k) => setStudentSort((p) => nextSort(p, k))} className="text-xs md:text-sm" />
                      <SortHead label="Hadir" k="hadir" sort={studentSort} onSort={(k) => setStudentSort((p) => nextSort(p, k))} className="text-center text-xs md:text-sm" />
                      <SortHead label="Sakit" k="sakit" sort={studentSort} onSort={(k) => setStudentSort((p) => nextSort(p, k))} className="text-center text-xs md:text-sm" />
                      <SortHead label="Izin" k="izin" sort={studentSort} onSort={(k) => setStudentSort((p) => nextSort(p, k))} className="text-center text-xs md:text-sm" />
                      <SortHead label="Alpa" k="alpa" sort={studentSort} onSort={(k) => setStudentSort((p) => nextSort(p, k))} className="text-center text-xs md:text-sm" />
                      <SortHead label="Total" k="total" sort={studentSort} onSort={(k) => setStudentSort((p) => nextSort(p, k))} className="text-center text-xs md:text-sm" />
                      <SortHead label="% Hadir" k="pct" sort={studentSort} onSort={(k) => setStudentSort((p) => nextSort(p, k))} className="w-40 text-xs md:text-sm" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentPager.paginatedItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                          {studentFilterActive ? 'Tidak ada siswa yang cocok dengan filter.' : 'Belum ada siswa.'}
                        </TableCell>
                      </TableRow>
                    )}
                    {studentPager.paginatedItems.map((student, index) => {
                      const pct = student.total > 0 ? (student.hadir / student.total) * 100 : null;
                      return (
                        <TableRow key={student.id} className="hover:bg-muted/40">
                          <TableCell className="text-xs text-muted-foreground md:text-sm">
                            {(studentPager.currentPage - 1) * studentPager.pageSize + index + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar name={student.full_name} />
                              <span className="text-sm font-medium">{toTitleCase(student.full_name)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground md:text-sm">{student.nis}</TableCell>
                          {STATUS_KEYS.map((k) => (
                            <TableCell key={k} className="text-center">
                              <span
                                className={`inline-block min-w-[1.75rem] rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums md:text-sm ${
                                  student[k] > 0 ? `${STATUS_META[k].bg} ${STATUS_META[k].text}` : 'text-muted-foreground/60'
                                }`}
                              >
                                {student[k]}
                              </span>
                            </TableCell>
                          ))}
                          <TableCell className="text-center text-xs tabular-nums md:text-sm">{student.total}</TableCell>
                          <TableCell>
                            {pct == null ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                  <div className={`h-full rounded-full ${pctBar(pct)}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className={`text-xs font-semibold tabular-nums md:text-sm ${pctTone(pct)}`}>{pct.toFixed(1)}%</span>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <DataPagination
                currentPage={studentPager.currentPage}
                totalPages={studentPager.totalPages}
                totalItems={studentPager.totalItems}
                pageSize={studentPager.pageSize}
                onPageChange={studentPager.setCurrentPage}
                onPageSizeChange={studentPager.setPageSize}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            </SectionCard>

            {/* Riwayat absensi */}
            <SectionCard title="Riwayat Absensi" description={`${historyPager.totalItems} catatan`}>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Cari nama / NIS…"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                  />
                </div>
                <Select value={historyStatus} onValueChange={(v) => setHistoryStatus(v as typeof historyStatus)}>
                  <SelectTrigger className="sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua status</SelectItem>
                    <SelectItem value="hadir">Hadir</SelectItem>
                    <SelectItem value="sakit">Sakit</SelectItem>
                    <SelectItem value="izin">Izin</SelectItem>
                    <SelectItem value="alpa">Alpa</SelectItem>
                  </SelectContent>
                </Select>
                {historyFilterActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setHistorySearch('');
                      setHistoryStatus('all');
                    }}
                  >
                    <XIcon className="mr-1 h-4 w-4" />
                    Reset
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <Table className="min-w-[560px]">
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <SortHead label="Tanggal" k="date" sort={historySort} onSort={(k) => setHistorySort((p) => nextSort(p, k))} className="text-xs md:text-sm" />
                      <SortHead label="NIS" k="nis" sort={historySort} onSort={(k) => setHistorySort((p) => nextSort(p, k))} className="text-xs md:text-sm" />
                      <SortHead label="Nama" k="name" sort={historySort} onSort={(k) => setHistorySort((p) => nextSort(p, k))} className="text-xs md:text-sm" />
                      <SortHead label="Status" k="status" sort={historySort} onSort={(k) => setHistorySort((p) => nextSort(p, k))} className="text-xs md:text-sm" />
                      <TableHead className="text-xs md:text-sm">Catatan</TableHead>
                      <TableHead className="w-14 text-xs md:text-sm">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyPager.paginatedItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          {historyFilterActive ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada data absensi pada periode ini.'}
                        </TableCell>
                      </TableRow>
                    )}
                    {historyPager.paginatedItems.map((record) => (
                      <EditableAttendanceRow
                        key={`${record.id}`}
                        record={record}
                        onUpdate={() => queryClient.invalidateQueries({ queryKey: ['homeroom-attendance'] })}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DataPagination
                currentPage={historyPager.currentPage}
                totalPages={historyPager.totalPages}
                totalItems={historyPager.totalItems}
                pageSize={historyPager.pageSize}
                onPageChange={historyPager.setCurrentPage}
                onPageSizeChange={historyPager.setPageSize}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>

      <PdfPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={`Pratinjau Rekap Absensi ${homeroomClass.name}`}
        filename={homeroomRecapFileName(homeroomClass.name, filterStartDate, filterEndDate)}
        build={buildRecapPdf}
        rebuildKey={pdfRebuildKey}
        toolbar={
          <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
            <div>
              <Label className="text-xs">Tempat titimangsa</Label>
              <Input
                value={pdfPrefs.place}
                maxLength={60}
                onChange={(e) => patchPdfPrefs({ place: e.target.value })}
                placeholder="Ciamis"
                className="w-40"
              />
            </div>
            <div>
              <Label className="text-xs">Tanggal titimangsa</Label>
              <Input type="date" value={signDate} onChange={(e) => setSignDate(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">Kertas</Label>
              <Select value={pdfPrefs.paper} onValueChange={(v) => patchPdfPrefs({ paper: v as PdfPaper })}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAPER_LABEL) as PdfPaper[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {PAPER_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Checkbox
                id="hr-pdf-filtered"
                checked={pdfOnlyFiltered}
                onCheckedChange={(v) => setPdfOnlyFiltered(v === true)}
              />
              <Label htmlFor="hr-pdf-filtered" className="text-xs">
                Ikuti filter &amp; urutan tabel ({visibleStudents.length} dari {studentRows.length} siswa)
              </Label>
            </div>
          </div>
        }
      />
    </DashboardLayout>
  );
};

export default HomeroomAttendance;