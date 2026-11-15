import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Eye, FileText, Loader2, Lock, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataPagination } from '@/components/ui/data-pagination';
import { usePagination } from '@/components/ui/usePagination';
import { PdfPreviewDialog } from '@/components/piket/PdfPreviewDialog';
import { KaihPercentChart } from '@/components/kaih/KaihPercentChart';
import { KaihEntryDialog } from '@/components/kaih/KaihEntryDialog';
import { PAPER_LABEL, type PdfPaper } from '@/lib/pdfPaper';
import { buildKaihStudentPdf, kaihStudentFileName } from '@/lib/kaihPdf';
import {
  addDaysIso, daysBetween, fetchAllRows, firstOfMonthIso, fmtDateLong, fmtDateShort, fmtPct, HABITS, habitDetail, isDone, isEditableDate,
  kaihErrorMessage, KAIH_EDIT_WINDOW_DAYS, statsFromEntries, todayWib, type KaihEntry,
} from '@/lib/kaih';

const db = supabase as any;

type SortKey = 'date' | 'count';
type CompletenessFilter = 'all' | 'full' | 'partial';

const PDF_PREFS_KEY = 'pusaka.kaihStudent.pdfPrefs';
const loadPdfPrefs = (): { place: string; paper: PdfPaper } => {
  try {
    const raw = JSON.parse(localStorage.getItem(PDF_PREFS_KEY) || '{}');
    return { place: typeof raw.place === 'string' ? raw.place : 'Ciamis', paper: raw.paper === 'f4' ? 'f4' : 'a4' };
  } catch {
    return { place: 'Ciamis', paper: 'a4' };
  }
};

export default function KaihJournal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = todayWib();

  // ---- data siswa ----
  const { data: student, isLoading: loadingStudent } = useQuery({
    queryKey: ['kaih-student', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_accounts')
        .select('student_id, students(id, full_name, nisn, class_id, classes(name))')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      const s = (data as any)?.students;
      if (!s) return null;
      return { id: s.id as string, full_name: s.full_name as string, nisn: (s.nisn ?? null) as string | null, class_name: (s.classes?.name ?? null) as string | null };
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

  // ---- semua jurnal milik siswa (RLS: hanya miliknya) ----
  const { data: entries = [], isLoading: loadingEntries } = useQuery({
    queryKey: ['kaih-entries', student?.id],
    queryFn: () =>
      fetchAllRows<KaihEntry>((from, to) =>
        db.from('kaih_journals').select('*').eq('student_id', student!.id).order('entry_date', { ascending: false }).range(from, to),
      ),
    enabled: !!student?.id,
  });

  // ---- filter & urutan ----
  const [startDate, setStartDate] = useState(() => firstOfMonthIso(todayWib()));
  const [endDate, setEndDate] = useState(() => todayWib());
  const [completeness, setCompleteness] = useState<CompletenessFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const quick = (kind: 'week' | 'month' | 'all') => {
    if (kind === 'week') { setStartDate(addDaysIso(today, -6)); setEndDate(today); }
    else if (kind === 'month') { setStartDate(firstOfMonthIso(today)); setEndDate(today); }
    else { setStartDate(entries.length ? entries[entries.length - 1].entry_date : firstOfMonthIso(today)); setEndDate(today); }
  };

  const inRange = useMemo(
    () => entries.filter((e) => (!startDate || e.entry_date >= startDate) && (!endDate || e.entry_date <= endDate)),
    [entries, startDate, endDate],
  );
  const visible = useMemo(() => {
    const list = inRange.filter((e) => (completeness === 'full' ? e.habit_count === 7 : completeness === 'partial' ? e.habit_count < 7 : true));
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const primary = sortKey === 'date' ? a.entry_date.localeCompare(b.entry_date) : a.habit_count - b.habit_count;
      return primary !== 0 ? primary * dir : a.entry_date.localeCompare(b.entry_date) * -1;
    });
  }, [inRange, completeness, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'date' ? 'desc' : 'asc'); }
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" /> : sortDir === 'asc' ? <ArrowUp className="ml-1 inline h-3 w-3" /> : <ArrowDown className="ml-1 inline h-3 w-3" />;

  const pager = usePagination(visible, 10);
  useEffect(() => { pager.setCurrentPage(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [startDate, endDate, completeness, sortKey, sortDir]);

  // ---- ringkasan (periode terpilih, tanpa filter kelengkapan) ----
  const { stats, overall } = useMemo(() => statsFromEntries(inRange), [inRange]);
  const periodDays = useMemo(() => {
    const end = endDate && endDate < today ? endDate : today;
    return startDate ? daysBetween(startDate, end) : 0;
  }, [startDate, endDate, today]);
  const fullDays = inRange.filter((e) => e.habit_count === 7).length;
  const todayEntry = entries.find((e) => e.entry_date === today) ?? null;

  // ---- dialog isi/ubah/hapus ----
  const [formOpen, setFormOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<KaihEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KaihEntry | null>(null);
  const [detail, setDetail] = useState<KaihEntry | null>(null);

  const openNew = () => { setEditEntry(null); setFormOpen(true); };
  const openEdit = (e: KaihEntry) => { setEditEntry(e); setFormOpen(true); };

  const deleteMutation = useMutation({
    mutationFn: async (e: KaihEntry) => {
      const { error, data } = await db.from('kaih_journals').delete().eq('id', e.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw { code: '42501', message: 'row-level security' };
    },
    onSuccess: () => {
      toast.success('Jurnal dihapus.');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['kaih-entries', student?.id] });
    },
    onError: (err: any) => toast.error(kaihErrorMessage(err)),
  });

  // ---- PDF ----
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfPrefs, setPdfPrefs] = useState(loadPdfPrefs);
  const [signDate, setSignDate] = useState(() => todayWib());
  const patchPdfPrefs = (p: Partial<{ place: string; paper: PdfPaper }>) =>
    setPdfPrefs((prev) => {
      const next = { ...prev, ...p };
      try { localStorage.setItem(PDF_PREFS_KEY, JSON.stringify(next)); } catch { /* abaikan */ }
      return next;
    });
  const rebuildRaw = [pdfPrefs.place, pdfPrefs.paper, signDate, startDate, endDate, inRange.map((e) => e.id + e.updated_at).join(','), !!schoolSettings].join('|');
  const [rebuildKey, setRebuildKey] = useState(rebuildRaw);
  useEffect(() => {
    const t = setTimeout(() => setRebuildKey(rebuildRaw), 500);
    return () => clearTimeout(t);
  }, [rebuildRaw]);

  const buildPdf = async () => {
    if (!student) throw new Error('Data siswa belum dimuat.');
    if (!schoolSettings) throw new Error('Pengaturan sekolah belum dimuat. Tutup lalu coba lagi sebentar lagi.');
    return buildKaihStudentPdf(
      {
        studentName: student.full_name,
        nisn: student.nisn,
        className: student.class_name,
        startDate,
        endDate,
        entries: [...inRange].sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
        place: pdfPrefs.place,
        signDate,
        paper: pdfPrefs.paper,
      },
      schoolSettings,
    );
  };
  const openPdf = () => {
    if (!schoolSettings) { toast.error('Pengaturan sekolah belum dimuat. Silakan coba lagi.'); return; }
    if (inRange.length === 0) { toast.error('Tidak ada jurnal pada periode ini.'); return; }
    setPreviewOpen(true);
  };

  // ---- tampilan ----
  if (loadingStudent) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Memuat…</div>
      </DashboardLayout>
    );
  }
  if (!student) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center text-muted-foreground">Akun Anda belum terhubung dengan data siswa. Hubungi wali kelas atau admin.</CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Jurnal 7 Kebiasaan Anak Indonesia Hebat</h1>
            <p className="text-sm text-muted-foreground">{student.full_name}{student.class_name ? ` • Kelas ${student.class_name}` : ''}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openPdf}><FileText className="mr-2 h-4 w-4" />Pratinjau PDF</Button>
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Isi Jurnal</Button>
          </div>
        </div>

        {!todayEntry && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">Kamu belum mengisi jurnal hari ini ({fmtDateLong(today)}). Yuk isi sekarang!</p>
              <Button size="sm" onClick={openNew}>Isi jurnal hari ini</Button>
            </CardContent>
          </Card>
        )}

        {/* Filter periode */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
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
              <Button variant="outline" size="sm" onClick={() => quick('all')}>Semua</Button>
            </div>
            <div>
              <Label className="text-xs">Kelengkapan</Label>
              <Select value={completeness} onValueChange={(v) => setCompleteness(v as CompletenessFilter)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua jurnal</SelectItem>
                  <SelectItem value="full">Lengkap (7 dari 7)</SelectItem>
                  <SelectItem value="partial">Belum lengkap</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Ringkasan + grafik */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <Card><CardHeader className="pb-2"><CardDescription>Jurnal terisi</CardDescription><CardTitle className="text-2xl">{inRange.length}<span className="text-sm font-normal text-muted-foreground"> / {periodDays} hari</span></CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Hari lengkap (7 kebiasaan)</CardDescription><CardTitle className="text-2xl">{fullDays}</CardTitle></CardHeader></Card>
            <Card className="col-span-2 lg:col-span-1"><CardHeader className="pb-2"><CardDescription>Rata-rata pelaksanaan</CardDescription><CardTitle className="text-2xl">{fmtPct(overall)}</CardTitle></CardHeader></Card>
          </div>
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Persentase tiap kebiasaan</CardTitle>
              <CardDescription>Hari terlaksana ÷ jumlah jurnal yang terisi pada periode ini.</CardDescription>
            </CardHeader>
            <CardContent><KaihPercentChart stats={stats} total={inRange.length} height={300} /></CardContent>
          </Card>
        </div>

        {/* Tabel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daftar jurnal</CardTitle>
            <CardDescription>Jurnal dapat diubah atau dihapus sampai {KAIH_EDIT_WINDOW_DAYS} hari ke belakang. Sesudah itu terkunci.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('date')}>Tanggal<SortIcon k="date" /></TableHead>
                    {HABITS.map((h) => (
                      <TableHead key={h.key} className="text-center" title={`${h.no}. ${h.label}`}>
                        <h.icon className="mx-auto h-4 w-4" style={{ color: h.color }} aria-label={h.label} />
                      </TableHead>
                    ))}
                    <TableHead className="cursor-pointer select-none whitespace-nowrap text-center" onClick={() => toggleSort('count')}>Jumlah<SortIcon k="count" /></TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingEntries ? (
                    <TableRow><TableCell colSpan={HABITS.length + 3} className="py-8 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Memuat jurnal…</TableCell></TableRow>
                  ) : pager.paginatedItems.length === 0 ? (
                    <TableRow><TableCell colSpan={HABITS.length + 3} className="py-8 text-center text-muted-foreground">Belum ada jurnal pada filter ini.</TableCell></TableRow>
                  ) : (
                    pager.paginatedItems.map((e) => {
                      const editable = isEditableDate(e.entry_date, today);
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap font-medium">{fmtDateShort(e.entry_date)}</TableCell>
                          {HABITS.map((h) => {
                            const ok = isDone(e, h.key);
                            const d = habitDetail(e, h.key);
                            return (
                              <TableCell key={h.key} className="text-center" title={`${h.label}: ${ok ? 'Ya' : 'Tidak'}${d ? ` — ${d}` : ''}`}>
                                {ok ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" /> : <XCircle className="mx-auto h-4 w-4 text-muted-foreground/40" />}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center">
                            <Badge variant={e.habit_count === 7 ? 'default' : 'secondary'}>{e.habit_count}/7</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => setDetail(e)} title="Lihat detail"><Eye className="h-4 w-4" /></Button>
                              {editable ? (
                                <>
                                  <Button size="icon" variant="ghost" onClick={() => openEdit(e)} title="Ubah"><Pencil className="h-4 w-4" /></Button>
                                  <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(e)} title="Hapus"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </>
                              ) : (
                                <span className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground" title="Terkunci (lebih dari 7 hari)"><Lock className="h-4 w-4" /></span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
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
      </div>

      <KaihEntryDialog open={formOpen} onClose={() => setFormOpen(false)} studentId={student.id} entries={entries} editEntry={editEntry} />

      {/* Detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Jurnal {detail ? fmtDateLong(detail.entry_date) : ''}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2">
              {HABITS.map((h) => {
                const ok = isDone(detail, h.key);
                const d = habitDetail(detail, h.key);
                return (
                  <div key={h.key} className="flex items-start gap-3 rounded-md border p-2">
                    <h.icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: h.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{h.no}. {h.label}</div>
                      {d && <div className="text-xs text-muted-foreground">{d}</div>}
                    </div>
                    <Badge variant={ok ? 'default' : 'secondary'}>{ok ? 'Ya' : 'Tidak'}</Badge>
                  </div>
                );
              })}
              {detail.notes && <p className="rounded-md bg-muted/50 p-2 text-sm"><span className="font-medium">Catatan: </span>{detail.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus jurnal?</AlertDialogTitle>
            <AlertDialogDescription>Jurnal tanggal {deleteTarget ? fmtDateLong(deleteTarget.entry_date) : ''} akan dihapus dan tidak bisa dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)} disabled={deleteMutation.isPending}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PdfPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Pratinjau Jurnal 7 Kebiasaan"
        filename={kaihStudentFileName(student.full_name, startDate, endDate)}
        build={buildPdf}
        rebuildKey={rebuildKey}
        toolbar={
          <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
            <div>
              <Label className="text-xs">Tempat titimangsa</Label>
              <Input value={pdfPrefs.place} maxLength={60} onChange={(e) => patchPdfPrefs({ place: e.target.value })} placeholder="Ciamis" className="w-40" />
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
            <p className="pb-2 text-xs text-muted-foreground">Periode: {fmtDateLong(startDate)} – {fmtDateLong(endDate)} ({inRange.length} jurnal)</p>
          </div>
        }
      />
    </DashboardLayout>
  );
}
