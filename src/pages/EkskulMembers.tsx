import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Bar, BarChart, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Pencil, Plus, Printer, Search, Trash2,
  UserPlus, Users,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

// Baris mentah dari tabel students (join ke classes)
interface StudentDbRow {
  id: string;
  full_name: string;
  nis: string;
  nisn: string | null;
  gender: string | null;
  classes: { name: string } | { name: string }[] | null;
}

const STATUS_LABEL: Record<Member['status'], string> = {
  aktif: 'Aktif',
  nonaktif: 'Nonaktif',
  keluar: 'Keluar',
};

const statusVariant = (s: Member['status']) =>
  s === 'aktif' ? 'default' : s === 'nonaktif' ? 'secondary' : 'outline';

const PICKER_LIMIT = 100;
const NO_CLASS = 'Tanpa kelas';
const DB_PAGE = 1000; // ukuran halaman saat mengambil data dari database
const INSERT_CHUNK = 500; // jumlah baris per sekali insert saat menambah banyak anggota

const COLOR_JOINED = '#16a34a';
const COLOR_NOT_JOINED = '#f59e0b';
const BAR_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#65a30d'];

const pct = (part: number, total: number) => (total === 0 ? 0 : (part / total) * 100);
const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;

// =============================================================================
// Pagination (client-side)
// =============================================================================
const PAGE_SIZES = [10, 25, 50, 100];

interface PaginationState {
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  totalPages: number;
  start: number;
  total: number;
}

function usePagination<T>(items: T[], resetKey: string, initialSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  // Kembali ke halaman 1 saat filter/ukuran halaman berubah
  useEffect(() => { setPage(1); }, [resetKey, pageSize]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;
  const pageItems = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);

  const state: PaginationState = { page: current, setPage, pageSize, setPageSize, totalPages, start, total: items.length };
  return { ...state, pageItems };
}

function PaginationBar({ pg }: { pg: PaginationState }) {
  if (pg.total === 0) return null;
  const from = pg.start + 1;
  const to = Math.min(pg.start + pg.pageSize, pg.total);
  const windowStart = Math.max(1, Math.min(pg.page - 2, pg.totalPages - 4));
  const pages = Array.from({ length: Math.min(5, pg.totalPages) }, (_, i) => windowStart + i);

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>Menampilkan {from}–{to} dari {pg.total}</span>
        <Select value={String(pg.pageSize)} onValueChange={(v) => pg.setPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} / halaman</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => pg.setPage(1)} disabled={pg.page === 1} aria-label="Halaman pertama">
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => pg.setPage(pg.page - 1)} disabled={pg.page === 1} aria-label="Sebelumnya">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p) => (
          <Button
            key={p}
            size="icon"
            variant={p === pg.page ? 'default' : 'outline'}
            className="h-8 w-8"
            onClick={() => pg.setPage(p)}
            aria-label={`Halaman ${p}`}
            aria-current={p === pg.page ? 'page' : undefined}
          >
            {p}
          </Button>
        ))}
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => pg.setPage(pg.page + 1)} disabled={pg.page === pg.totalPages} aria-label="Berikutnya">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => pg.setPage(pg.totalPages)} disabled={pg.page === pg.totalPages} aria-label="Halaman terakhir">
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Tab "Pemetaan Siswa": seluruh siswa aktif x ekskul + grafik persentase
// =============================================================================
interface StudentRow {
  id: string;
  name: string;
  nis: string;
  className: string;
  typeIds: Set<string>; // hanya keanggotaan berstatus "aktif"
}

type MapMode = 'all' | 'joined' | 'none' | 'multi';

function EkskulMappingTab({ types }: { types: { id: string; name: string }[] }) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [mode, setMode] = useState<MapMode>('all');

  // SEMUA siswa aktif langsung dari tabel students (status = 'aktif', bukan alumni).
  // Diambil bertahap (1000 baris/halaman) agar aman bila siswa > 1000.
  const { data: activeStudents = [], isLoading: dirLoading } = useQuery({
    queryKey: ['ekskul-active-students'],
    enabled: types.length > 0,
    queryFn: async (): Promise<DirectoryStudent[]> => {
      const out: DirectoryStudent[] = [];
      for (let from = 0; ; from += DB_PAGE) {
        const { data, error } = await ekskulDb
          .from('students')
          .select('id, full_name, nis, nisn, gender, classes(name)')
          .eq('status', 'aktif')
          .or('is_alumni.is.null,is_alumni.eq.false') // bukan alumni
          .order('full_name')
          .order('id')
          .range(from, from + DB_PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as unknown as StudentDbRow[];
        for (const r of rows) {
          const cls = Array.isArray(r.classes) ? r.classes[0] : r.classes;
          out.push({ id: r.id, full_name: r.full_name, nis: r.nis, nisn: r.nisn, gender: r.gender, class_name: cls?.name ?? null });
        }
        if (rows.length < DB_PAGE) break;
      }
      return out;
    },
  });

  // Keanggotaan seluruh ekskul. Key diawali 'ekskul-members' sehingga ikut
  // ter-invalidate saat anggota ditambah/diubah/dihapus.
  const { data: allMembers = [], isLoading: memLoading } = useQuery({
    queryKey: ['ekskul-members', 'mapping-all'],
    enabled: types.length > 0,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await ekskulDb.rpc('get_ekskul_members', { _type_id: null });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const isLoading = dirLoading || memLoading;

  // Semua siswa aktif, termasuk yang belum punya ekskul
  const students = useMemo(() => {
    const map = new Map<string, StudentRow>();
    for (const s of activeStudents) {
      map.set(s.id, { id: s.id, name: s.full_name, nis: s.nis, className: s.class_name ?? NO_CLASS, typeIds: new Set() });
    }
    for (const m of allMembers) {
      if (m.status !== 'aktif') continue;
      map.get(m.student_id)?.typeIds.add(m.extracurricular_type_id); // abaikan siswa non-aktif
    }
    return Array.from(map.values()).sort(
      (a, b) => a.className.localeCompare(b.className, 'id', { numeric: true }) || a.name.localeCompare(b.name, 'id'),
    );
  }, [activeStudents, allMembers]);

  const classOptions = useMemo(
    () => Array.from(new Set(students.map((s) => s.className))).sort((a, b) => a.localeCompare(b, 'id', { numeric: true })),
    [students],
  );

  // Cakupan data (mengikuti filter kelas) -> kartu ringkasan & grafik
  const scoped = useMemo(
    () => students.filter((s) => classFilter === 'all' || s.className === classFilter),
    [students, classFilter],
  );

  const total = scoped.length;
  const joined = scoped.filter((s) => s.typeIds.size > 0).length;
  const notJoined = total - joined;
  const multiCount = scoped.filter((s) => s.typeIds.size > 1).length;

  const participationData = [
    { name: 'Ikut ekskul', value: joined, color: COLOR_JOINED },
    { name: 'Belum ikut ekskul', value: notJoined, color: COLOR_NOT_JOINED },
  ];

  const perTypeData = useMemo(
    () =>
      types
        .map((t) => {
          const count = scoped.filter((s) => s.typeIds.has(t.id)).length;
          const share = pct(count, total);
          return { name: t.name, count, share, label: `${fmtPct(share)} (${count})` };
        })
        .sort((a, b) => b.count - a.count),
    [types, scoped, total],
  );

  // Tabel (filter tambahan: pencarian & mode)
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return scoped.filter((s) => {
      if (mode === 'joined' && s.typeIds.size === 0) return false;
      if (mode === 'none' && s.typeIds.size > 0) return false;
      if (mode === 'multi' && s.typeIds.size < 2) return false;
      if (!term) return true;
      return [s.name, s.nis, s.className].some((v) => v.toLowerCase().includes(term));
    });
  }, [scoped, search, mode]);

  const pg = usePagination(rows, `${classFilter}|${mode}|${search}`);

  // Total di footer dihitung dari SELURUH hasil filter (bukan hanya halaman ini)
  const totalPerType = useMemo(
    () => new Map(types.map((t) => [t.id, rows.filter((s) => s.typeIds.has(t.id)).length])),
    [rows, types],
  );

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total siswa aktif</p>
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground">{classFilter === 'all' ? 'Seluruh kelas' : classFilter}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Ikut ekskul</p>
            <p className="text-2xl font-bold" style={{ color: COLOR_JOINED }}>{joined}</p>
            <p className="text-xs text-muted-foreground">{fmtPct(pct(joined, total))} · {multiCount} siswa ikut &gt; 1 ekskul</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Belum ikut ekskul</p>
            <p className="text-2xl font-bold" style={{ color: COLOR_NOT_JOINED }}>{notJoined}</p>
            <p className="text-xs text-muted-foreground">{fmtPct(pct(notJoined, total))} dari siswa aktif</p>
          </CardContent>
        </Card>
      </div>

      {/* Grafik */}
      {!isLoading && total > 0 && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Partisipasi siswa dalam ekskul</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={participationData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      labelLine={false}
                      label={({ percent }) => (percent ? fmtPct(percent * 100) : '')}
                    >
                      {participationData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`${v} siswa (${fmtPct(pct(v, total))})`, n]} />
                    <Legend verticalAlign="bottom" iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Persentase anggota per jenis ekskul</CardTitle>
              <p className="text-xs text-muted-foreground">Dihitung dari total siswa aktif. Satu siswa dapat ikut lebih dari satu ekskul.</p>
            </CardHeader>
            <CardContent>
              <div style={{ height: Math.max(240, perTypeData.length * 38 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perTypeData} layout="vertical" margin={{ left: 8, right: 70, top: 8, bottom: 8 }}>
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(_v: number, _n: string, item) => [`${item.payload.count} siswa (${fmtPct(item.payload.share)})`, 'Anggota']} />
                    <Bar dataKey="share" radius={[0, 4, 4, 0]}>
                      {perTypeData.map((d, i) => <Cell key={d.name} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                      <LabelList dataKey="label" position="right" style={{ fontSize: 12 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter tabel */}
      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Cari siswa</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Nama, NIS, atau kelas..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Kelas</Label>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kelas</SelectItem>
                {classOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tampilkan</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as MapMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua siswa aktif</SelectItem>
                <SelectItem value="joined">Sudah ikut ekskul</SelectItem>
                <SelectItem value="none">Belum ikut ekskul</SelectItem>
                <SelectItem value="multi">Ikut lebih dari 1 ekskul</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">Tidak ada data pemetaan.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead className="min-w-[180px]">Nama</TableHead>
                      <TableHead>Kelas</TableHead>
                      {types.map((t) => (
                        <TableHead key={t.id} className="whitespace-nowrap text-center">{t.name}</TableHead>
                      ))}
                      <TableHead className="text-center">Jumlah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pg.pageItems.map((s, i) => (
                      <TableRow key={s.id}>
                        <TableCell>{pg.start + i + 1}</TableCell>
                        <TableCell className="font-medium">
                          {s.name}
                          <p className="text-xs font-normal text-muted-foreground">{s.nis}</p>
                        </TableCell>
                        <TableCell>{s.className}</TableCell>
                        {types.map((t) => (
                          <TableCell key={t.id} className="text-center">
                            {s.typeIds.has(t.id) ? <Check className="mx-auto h-4 w-4 text-primary" aria-label="Ikut" /> : null}
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          {s.typeIds.size === 0 ? (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">Belum ikut</Badge>
                          ) : (
                            <Badge variant={s.typeIds.size > 1 ? 'default' : 'secondary'}>{s.typeIds.size}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="font-semibold">Total siswa per ekskul (seluruh hasil filter)</TableCell>
                      {types.map((t) => (
                        <TableCell key={t.id} className="text-center font-semibold">{totalPerType.get(t.id) ?? 0}</TableCell>
                      ))}
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
              <PaginationBar pg={pg} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Halaman utama
// =============================================================================
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

  // Pembina/admin/kesiswaan: auto-pilih ekskul pertama bila belum ada pilihan.
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

  const memberPg = usePagination(visibleMembers, `${activeType}|${statusFilter}|${search}`);

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

  // Status "pilih semua": mengacu pada SELURUH kandidat hasil filter (bukan hanya 100 yang tampil)
  const pickedInCandidates = useMemo(
    () => candidates.reduce((n, s) => (picked.has(s.id) ? n + 1 : n), 0),
    [candidates, picked],
  );
  const allCandidatesPicked = candidates.length > 0 && pickedInCandidates === candidates.length;
  const someCandidatesPicked = pickedInCandidates > 0 && !allCandidatesPicked;

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
      // Insert bertahap agar aman saat memilih banyak siswa sekaligus
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const { error } = await ekskulDb.from('extracurricular_members').insert(rows.slice(i, i + INSERT_CHUNK));
        if (error) throw error;
      }
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

  // Pilih / batalkan pilihan seluruh siswa hasil filter saat ini
  const toggleAllCandidates = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allCandidatesPicked) {
        for (const s of candidates) next.delete(s.id);
      } else {
        for (const s of candidates) next.add(s.id);
      }
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
          <Tabs defaultValue="list" className="space-y-4">
            <TabsList>
              <TabsTrigger value="list">Daftar Anggota</TabsTrigger>
              <TabsTrigger value="map">Pemetaan Siswa</TabsTrigger>
            </TabsList>

            {/* ----------------------------- Tab daftar anggota ----------------------------- */}
            <TabsContent value="list" className="space-y-6">
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
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">No</TableHead>
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
                            {memberPg.pageItems.map((m, i) => (
                              <TableRow key={m.id}>
                                <TableCell>{memberPg.start + i + 1}</TableCell>
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
                      <PaginationBar pg={memberPg} />
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ----------------------------- Tab pemetaan siswa ----------------------------- */}
            <TabsContent value="map">
              <EkskulMappingTab types={types} />
            </TabsContent>
          </Tabs>
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
                {/* Pilih semua (mengikuti pencarian & filter kelas yang sedang aktif) */}
                <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-3 border-b bg-muted px-3 py-2 hover:bg-muted/80">
                  <Checkbox
                    checked={allCandidatesPicked ? true : someCandidatesPicked ? 'indeterminate' : false}
                    onCheckedChange={toggleAllCandidates}
                    aria-label="Pilih semua siswa"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {allCandidatesPicked ? 'Batalkan pilihan semua' : 'Pilih semua'} ({candidates.length} siswa)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pickSearch.trim() || pickClass !== 'all'
                        ? 'Hanya siswa sesuai pencarian/filter kelas saat ini.'
                        : 'Seluruh siswa yang belum terdaftar di ekskul ini.'}
                    </p>
                  </div>
                </label>
                {candidates.slice(0, PICKER_LIMIT).map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-0 hover:bg-muted/50">
                    <Checkbox checked={picked.has(s.id)} onCheckedChange={() => togglePick(s.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">{s.nis} · {s.class_name ?? NO_CLASS}</p>
                    </div>
                  </label>
                ))}
                {candidates.length > PICKER_LIMIT && (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    Menampilkan {PICKER_LIMIT} dari {candidates.length} siswa. Persempit dengan pencarian atau filter kelas.
                    {' '}“Pilih semua” tetap mencakup seluruh {candidates.length} siswa.
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{picked.size} siswa dipilih</span>
              {picked.size > 0 && (
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => setPicked(new Set())}
                  disabled={addMembers.isPending}
                >
                  Kosongkan
                </button>
              )}
            </div>
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
            <DialogDescription>{editing?.full_name} · {editing?.class_name ?? NO_CLASS}</DialogDescription>
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
