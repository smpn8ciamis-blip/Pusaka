import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, ExternalLink, Eye, Loader2, Printer, RotateCcw, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { DataPagination } from '@/components/ui/data-pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useDirectoryClasses, useDirectoryStudents } from '@/hooks/useStudentDirectory';
import { compareText, isActiveStudent } from '@/lib/studentDirectory';
import { PAPER_LABEL, type PdfOrientation, type PdfPaper } from '@/lib/pdfPaper';
import {
  DEFAULT_STUDENT_LIST_TITLE, MAX_EXTRA_COLUMNS, buildStudentListPdf, studentListFileName,
  type StudentListPdfOptions,
} from '@/lib/studentListPdf';
import { toTitleCase } from '@/lib/utils';

// RPC baru belum ada di types.ts yang digenerate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Homeroom { class_id: string; teacher_name: string | null; teacher_nip: string | null }
type SortKey = 'name' | 'nisn';
type SortDir = 'asc' | 'desc';

interface Prefs {
  title: string;
  place: string;
  extraCount: number;
  headings: string[]; // sepanjang MAX_EXTRA_COLUMNS
  paper: PdfPaper;
  orientation: PdfOrientation;
  fillHomeroom: boolean;
}

const STORAGE_KEY = 'cds-prefs-v1';
const defaultHeadings = () => Array.from({ length: MAX_EXTRA_COLUMNS }, (_, i) => String(i + 1));
const defaultPrefs = (): Prefs => ({
  title: DEFAULT_STUDENT_LIST_TITLE,
  place: 'Ciamis',
  extraCount: 4,
  headings: defaultHeadings(),
  paper: 'a4',
  orientation: 'portrait',
  fillHomeroom: true,
});

function loadPrefs(): Prefs {
  const d = defaultPrefs();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return d;
    const headings = defaultHeadings().map((h, i) => (typeof raw.headings?.[i] === 'string' ? raw.headings[i] : h));
    return {
      title: typeof raw.title === 'string' ? raw.title : d.title,
      place: typeof raw.place === 'string' ? raw.place : d.place,
      extraCount: Number.isInteger(raw.extraCount) ? Math.min(MAX_EXTRA_COLUMNS, Math.max(0, raw.extraCount)) : d.extraCount,
      headings,
      paper: raw.paper === 'f4' ? 'f4' : 'a4',
      orientation: raw.orientation === 'landscape' ? 'landscape' : 'portrait',
      fillHomeroom: raw.fillHomeroom !== false,
    };
  } catch {
    return d;
  }
}

function SortHead({
  label, k, sortKey, sortDir, onSort, className,
}: { label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; className?: string }) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={() => onSort(k)}>
        {label} <Icon className={`h-3.5 w-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
      </button>
    </TableHead>
  );
}

/* ------------------------------------------------------------------ */
/* Pratinjau + cetak                                                   */
/* ------------------------------------------------------------------ */
function PreviewDialog({
  open, onClose, build, fileName, autoPrint,
}: {
  open: boolean;
  onClose: () => void;
  build: () => Promise<{ blob: Blob; save: () => void }>;
  fileName: string;
  autoPrint: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const saveRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    if (!open) { setUrl(null); printed.current = false; return; }
    let cancelled = false;
    let made: string | null = null;
    setBusy(true);
    setFailed(false);
    build()
      .then(({ blob, save }) => {
        if (cancelled) return;
        saveRef.current = save;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch((e) => { console.error(e); if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [open, build]);

  const print = () => {
    try {
      const w = frameRef.current?.contentWindow;
      if (!w) throw new Error('no frame');
      w.focus();
      w.print();
    } catch {
      if (url) window.open(url, '_blank', 'noopener');
      toast.message('Pratinjau dibuka di tab baru. Cetak dari sana (Ctrl+P).');
    }
  };

  // "Cetak" langsung: buka dialog lalu panggil dialog cetak begitu PDF termuat
  const onFrameLoad = () => {
    if (autoPrint && !printed.current) {
      printed.current = true;
      setTimeout(print, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[95dvh] max-w-5xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Pratinjau {fileName.replace(/\.pdf$/i, '').replace(/-/g, ' ')}</DialogTitle>
          <DialogDescription>Periksa dulu, lalu cetak atau unduh sebagai PDF.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={print} disabled={!url}><Printer className="mr-2 h-4 w-4" /> Cetak</Button>
          <Button variant="outline" onClick={() => saveRef.current?.()} disabled={!url}><Download className="mr-2 h-4 w-4" /> Unduh PDF</Button>
          {url && (
            <Button variant="outline" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Buka di tab baru</a>
            </Button>
          )}
        </div>
        <div className="min-h-[60dvh] flex-1 overflow-hidden rounded-md border bg-muted/40">
          {busy ? (
            <div className="flex h-full min-h-[60dvh] items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Membuat pratinjau…
            </div>
          ) : failed ? (
            <div className="flex h-full min-h-[60dvh] items-center justify-center p-6 text-center text-destructive">
              PDF gagal dibuat. Coba lagi atau muat ulang halaman.
            </div>
          ) : url ? (
            <iframe ref={frameRef} src={url} title="Pratinjau daftar siswa" className="h-[70dvh] w-full" onLoad={onFrameLoad} />
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Bila pratinjau tidak tampil di HP, gunakan “Buka di tab baru” atau “Unduh PDF”.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman                                                             */
/* ------------------------------------------------------------------ */
export default function CetakDaftarSiswa() {
  const { data: students = [], isLoading, isError } = useDirectoryStudents();
  const { data: classes = [] } = useDirectoryClasses();
  const { data: homerooms = [] } = useQuery({
    queryKey: ['class-homeroom-infos'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Homeroom[]> => {
      const { data, error } = await db.rpc('class_homeroom_infos');
      if (error) throw error;
      return (data ?? []) as Homeroom[];
    },
  });
  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings-letterhead'],
    queryFn: async () => (await supabase.rpc('get_school_settings_for_letterhead')).data,
  });

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const patch = (p: Partial<Prefs>) => setPrefs((prev) => ({ ...prev, ...p }));
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* abaikan */ }
  }, [prefs]);

  const [classId, setClassId] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [autoPrint, setAutoPrint] = useState(false);

  // Hanya siswa aktif (bukan alumni, bukan mutasi keluar / nonaktif)
  const activeStudents = useMemo(() => students.filter(isActiveStudent), [students]);

  const sortFn = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return (a: (typeof students)[number], b: (typeof students)[number]) => {
      const ka = sortKey === 'nisn' ? a.nisn : a.full_name;
      const kb = sortKey === 'nisn' ? b.nisn : b.full_name;
      if (!ka && kb) return 1; // data kosong selalu di bawah
      if (ka && !kb) return -1;
      return (compareText(ka, kb) || compareText(a.full_name, b.full_name)) * dir;
    };
  }, [sortKey, sortDir]);

  // Daftar yang dicetak: seluruh siswa aktif kelas terpilih (pencarian tidak memengaruhi cetakan)
  const classStudents = useMemo(
    () => (classId === 'all' ? activeStudents : activeStudents.filter((s) => s.class_id === classId)).slice().sort(sortFn),
    [activeStudents, classId, sortFn],
  );
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return classStudents;
    return classStudents.filter((s) => `${s.full_name} ${s.nisn ?? ''} ${s.nis ?? ''}`.toLowerCase().includes(term));
  }, [classStudents, search]);

  useEffect(() => { setPage(1); }, [classId, search, sortKey, sortDir, pageSize]);

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = shown.slice((safePage - 1) * pageSize, safePage * pageSize);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  const cls = classes.find((c) => c.id === classId) ?? null;
  const homeroom = homerooms.find((h) => h.class_id === classId) ?? null;
  const canPrint = !!cls && classStudents.length > 0;

  const pdfOptions = (): StudentListPdfOptions => ({
    title: prefs.title,
    className: cls?.name ?? '',
    homeroomName: prefs.fillHomeroom ? homeroom?.teacher_name : null,
    homeroomNip: prefs.fillHomeroom ? homeroom?.teacher_nip : null,
    students: classStudents.map((s) => ({ nisn: s.nisn, nama: toTitleCase(s.full_name) })),
    extraColumns: prefs.headings.slice(0, prefs.extraCount),
    place: prefs.place,
    paper: prefs.paper,
    orientation: prefs.orientation,
  });

  const fileName = studentListFileName(cls?.name ?? '', prefs.title);

  // build berubah hanya bila masukan berubah, agar pratinjau tidak dibuat ulang tanpa perlu
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const build = useMemo(() => async () => {
    const doc = await buildStudentListPdf(pdfOptions(), schoolSettings as never);
    return { blob: doc.output('blob') as Blob, save: () => doc.save(fileName) };
  }, [prefs, cls, homeroom, classStudents, schoolSettings, fileName]);

  const open = (print: boolean) => {
    if (!cls) { toast.error('Pilih kelas terlebih dahulu'); return; }
    if (classStudents.length === 0) { toast.error('Tidak ada siswa aktif di kelas ini'); return; }
    setAutoPrint(print);
    setPreviewOpen(true);
  };

  const setHeading = (i: number, v: string) =>
    patch({ headings: prefs.headings.map((h, idx) => (idx === i ? v.slice(0, 40) : h)) });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Cetak Daftar Siswa</h1>
          <p className="text-sm text-muted-foreground">
            Cetak daftar siswa aktif per kelas dengan kop sekolah. Siswa alumni dan mutasi keluar tidak ikut dicetak.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Kelas</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua kelas (hanya tampilan)</SelectItem>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cds-title">Judul</Label>
                <Input id="cds-title" value={prefs.title} maxLength={80} placeholder={DEFAULT_STUDENT_LIST_TITLE}
                  onChange={(e) => patch({ title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cds-place">Tempat titimangsa</Label>
                <Input id="cds-place" value={prefs.place} maxLength={60} placeholder="Ciamis"
                  onChange={(e) => patch({ place: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cds-cols">Jumlah kolom tambahan (0–{MAX_EXTRA_COLUMNS})</Label>
                <Input id="cds-cols" type="number" min={0} max={MAX_EXTRA_COLUMNS} value={prefs.extraCount}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    patch({ extraCount: Number.isFinite(n) ? Math.min(MAX_EXTRA_COLUMNS, Math.max(0, n)) : 0 });
                  }} />
              </div>
            </div>

            {prefs.extraCount > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Judul kolom tambahan (boleh dikosongkan)</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => patch({ headings: defaultHeadings() })}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset 1, 2, 3…
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {prefs.headings.slice(0, prefs.extraCount).map((h, i) => (
                    <Input key={i} value={h} aria-label={`Judul kolom ${i + 1}`} placeholder={`Kolom ${i + 1}`}
                      onChange={(e) => setHeading(i, e.target.value)} />
                  ))}
                </div>
                {prefs.extraCount > 8 && prefs.orientation === 'portrait' && (
                  <p className="text-xs text-amber-700">Kolom cukup banyak; pertimbangkan orientasi Lanskap agar kolom lebih lebar.</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>Kertas</Label>
                <Select value={prefs.paper} onValueChange={(v) => patch({ paper: v as PdfPaper })}>
                  <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAPER_LABEL) as PdfPaper[]).map((p) => <SelectItem key={p} value={p}>{PAPER_LABEL[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Orientasi</Label>
                <Select value={prefs.orientation} onValueChange={(v) => patch({ orientation: v as PdfOrientation })}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Potret</SelectItem>
                    <SelectItem value="landscape">Lanskap</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Checkbox checked={prefs.fillHomeroom} onCheckedChange={(v) => patch({ fillHomeroom: v === true })} />
                Isi nama &amp; NIP wali kelas otomatis
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button onClick={() => open(false)} disabled={!canPrint}><Eye className="mr-2 h-4 w-4" /> Pratinjau PDF</Button>
              <Button variant="outline" onClick={() => open(true)} disabled={!canPrint}><Printer className="mr-2 h-4 w-4" /> Cetak</Button>
              <span className="text-sm text-muted-foreground">
                {!cls
                  ? 'Pilih kelas untuk mencetak.'
                  : `${classStudents.length} siswa aktif · Wali kelas: ${homeroom?.teacher_name ?? 'belum diatur'}`}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cari nama / NISN (tampilan saja)…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : isError ? (
                <p className="p-6 text-center text-destructive">Data siswa gagal dimuat. Muat ulang halaman.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">No</TableHead>
                      <SortHead label="NISN" k="nisn" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Nama" k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <TableHead>Kelas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Tidak ada siswa aktif.</TableCell></TableRow>
                    ) : pageItems.map((s, i) => (
                      <TableRow key={s.id}>
                        <TableCell>{(safePage - 1) * pageSize + i + 1}</TableCell>
                        <TableCell>{s.nisn || '-'}</TableCell>
                        <TableCell className="font-medium">{toTitleCase(s.full_name)}</TableCell>
                        <TableCell>{s.classes?.name ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <DataPagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={shown.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </div>
      </div>

      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} build={build} fileName={fileName} autoPrint={autoPrint} />
    </DashboardLayout>
  );
}
