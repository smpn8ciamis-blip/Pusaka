import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Search, RotateCcw, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataPagination } from '@/components/ui/data-pagination';
import { usePagination } from '@/components/ui/usePagination';

interface RemedialRow {
  student_id: string;
  full_name: string;
  nis: string | null;
  class_name: string | null;
  final_score: number | null;
  attempts_used: number;
  best_regular: number | null;
  best_remedial: number | null;
  remedial_attempts: number;
  in_progress: boolean;
  grant: { extra_attempts: number; expires_at: string; revoked: boolean; active: boolean } | null;
}

interface RemedialData {
  pass_score: number | null;
  title: string;
  subject: string;
  rows: RemedialRow[];
}

type RowFilter = 'all' | 'below' | 'active' | 'done';

const FILTER_LABEL: Record<RowFilter, string> = {
  all: 'Semua',
  below: 'Di bawah KKM, belum dibuka',
  active: 'Remidial sedang dibuka',
  done: 'Sudah tuntas (≥ KKM)',
};

const fmt = (v: number | null | undefined) => (v == null ? '-' : Number(v).toFixed(1));

/** Nilai default batas waktu: 3 hari lagi pukul 15.00 (format input datetime-local). */
const defaultDeadline = () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(15, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
};

interface Props {
  exam: { id: string; title: string; subject?: string; pass_score?: number | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CbtRemedialDialog({ exam, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const examId = exam?.id;

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RowFilter>('below');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [extraAttempts, setExtraAttempts] = useState(1);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setSearch('');
      setFilter('below');
      setDeadline(defaultDeadline());
      setExtraAttempts(1);
    }
  }, [open, examId]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cbt-remedial', examId],
    enabled: open && !!examId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cbt_remedial_candidates' as never, { p_exam_id: examId } as never);
      if (error) throw error;
      return data as unknown as RemedialData;
    },
  });

  const passScore = Number(data?.pass_score ?? exam?.pass_score ?? 70);
  const rows = data?.rows ?? [];

  const isBelow = (r: RemedialRow) => r.final_score != null && Number(r.final_score) < passScore;
  const isActive = (r: RemedialRow) => !!r.grant?.active;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.full_name} ${r.nis ?? ''} ${r.class_name ?? ''}`.toLowerCase().includes(q)) return false;
      if (filter === 'below') return isBelow(r) && !isActive(r);
      if (filter === 'active') return isActive(r);
      if (filter === 'done') return !isBelow(r);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, filter, passScore]);

  const pager = usePagination(visible, 10);
  useEffect(() => {
    pager.setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter]);

  const selectable = visible.filter(isBelow); // hanya siswa di bawah KKM yang bisa dibuka remidialnya
  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.student_id));
  const selectedRows = rows.filter((r) => selected.has(r.student_id));
  const selectedBelow = selectedRows.filter(isBelow);
  const selectedActive = selectedRows.filter(isActive);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cbt-remedial', examId] });
    queryClient.invalidateQueries({ queryKey: ['cbt-results', examId] });
  };

  const grantMutation = useMutation({
    mutationFn: async () => {
      const when = new Date(deadline);
      if (!deadline || Number.isNaN(when.getTime())) throw new Error('Isi batas waktu remidial.');
      const { data, error } = await supabase.rpc('cbt_remedial_grant' as never, {
        p_exam_id: examId,
        p_student_ids: selectedBelow.map((r) => r.student_id),
        p_expires_at: when.toISOString(),
        p_extra_attempts: extraAttempts,
      } as never);
      if (error) throw error;
      return data as unknown as { granted: number; skipped: number };
    },
    onSuccess: (res) => {
      toast.success(
        `Remidial dibuka untuk ${res.granted} siswa${res.skipped ? ` (${res.skipped} dilewati: sudah ≥ KKM / bukan siswa aktif)` : ''}`
      );
      setSelected(new Set());
      refresh();
    },
    onError: (e: any) => toast.error(e.message || 'Gagal membuka remidial'),
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cbt_remedial_revoke' as never, {
        p_exam_id: examId,
        p_student_ids: selectedActive.map((r) => r.student_id),
      } as never);
      if (error) throw error;
      return data as unknown as { revoked: number };
    },
    onSuccess: (res) => {
      toast.success(`Remidial ditutup untuk ${res.revoked} siswa`);
      setSelected(new Set());
      refresh();
    },
    onError: (e: any) => toast.error(e.message || 'Gagal menutup remidial'),
  });

  const grantStatus = (r: RemedialRow) => {
    if (!r.grant) return <span className="text-xs text-muted-foreground">-</span>;
    if (r.grant.active)
      return (
        <Badge className="bg-emerald-600 text-[10px]">
          Dibuka s.d. {format(new Date(r.grant.expires_at), 'd MMM HH:mm')}
        </Badge>
      );
    if (r.grant.revoked) return <Badge variant="outline" className="text-[10px]">Ditutup</Badge>;
    return <Badge variant="secondary" className="text-[10px]">Kedaluwarsa</Badge>;
  };

  const notMigrated = !!error && /cbt_remedial|schema cache|does not exist/i.test(String((error as any).message ?? ''));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" /> Remidial: {exam?.title}
          </DialogTitle>
          <DialogDescription>
            KKM {passScore}. Siswa di bawah KKM bisa diberi ujian ulang (soal sama) walau jadwal ujian sudah ditutup.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Nilai remidial yang masuk ke menu Nilai <b>dibatasi maksimal KKM</b> dan tidak pernah menurunkan nilai
            sebelumnya. Skor asli remidial tetap terlihat di hasil CBT. Hanya siswa yang dipilih di sini yang mendapat
            percobaan tambahan.
          </p>
        </div>

        {notMigrated ? (
          <p className="py-8 text-center text-sm text-destructive">
            Fitur remidial belum aktif di database. Minta admin menjalankan migrasi <code>20261113100000_cbt_remidial.sql</code>.
          </p>
        ) : error ? (
          <div className="py-8 text-center text-sm text-destructive">
            {(error as any).message || 'Gagal memuat daftar siswa'}{' '}
            <Button variant="link" size="sm" onClick={() => refetch()}>Coba lagi</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Cari nama / NIS / kelas…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as RowFilter)}>
                <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FILTER_LABEL) as RowFilter[]).map((k) => (
                    <SelectItem key={k} value={k}>{FILTER_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allChecked}
                        disabled={selectable.length === 0}
                        onCheckedChange={(v) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            selectable.forEach((r) => (v === true ? next.add(r.student_id) : next.delete(r.student_id)));
                            return next;
                          })
                        }
                        aria-label="Pilih semua siswa di bawah KKM"
                      />
                    </TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead className="text-center">Nilai akhir</TableHead>
                    <TableHead className="text-center">Percobaan</TableHead>
                    <TableHead className="text-center">Nilai remidial</TableHead>
                    <TableHead>Status remidial</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Memuat…</TableCell></TableRow>
                  )}
                  {!isLoading && pager.paginatedItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        {rows.length === 0 ? 'Belum ada siswa di bawah KKM pada ujian ini.' : 'Tidak ada siswa untuk filter ini.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {pager.paginatedItems.map((r) => (
                    <TableRow key={r.student_id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(r.student_id)}
                          onCheckedChange={(v) => toggle(r.student_id, v === true)}
                          aria-label={`Pilih ${r.full_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.full_name}</div>
                        <div className="text-xs text-muted-foreground">{r.nis ?? '-'}</div>
                      </TableCell>
                      <TableCell>{r.class_name ?? '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={isBelow(r) ? 'destructive' : 'default'}>{fmt(r.final_score)}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {r.attempts_used}
                        {r.in_progress && <span className="ml-1 text-[10px] text-amber-600">(berjalan)</span>}
                      </TableCell>
                      <TableCell className="text-center text-sm">{fmt(r.best_remedial)}</TableCell>
                      <TableCell>{grantStatus(r)}</TableCell>
                    </TableRow>
                  ))}
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

            <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
              <div>
                <Label className="text-xs">Batas waktu remidial</Label>
                <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-52" />
              </div>
              <div>
                <Label className="text-xs">Percobaan tambahan</Label>
                <Select value={String(extraAttempts)} onValueChange={(v) => setExtraAttempts(Number(v))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => grantMutation.mutate()}
                disabled={selectedBelow.length === 0 || grantMutation.isPending}
              >
                {grantMutation.isPending ? 'Memproses…' : `Buka remidial (${selectedBelow.length} siswa)`}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm(`Tutup remidial untuk ${selectedActive.length} siswa?`)) revokeMutation.mutate();
                }}
                disabled={selectedActive.length === 0 || revokeMutation.isPending}
              >
                Tutup remidial ({selectedActive.length})
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
