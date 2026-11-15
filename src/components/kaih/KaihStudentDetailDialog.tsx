import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { KaihPercentChart } from '@/components/kaih/KaihPercentChart';
import { fetchAllRows, fmtDateLong, fmtDateShort, fmtPct, HABITS, habitDetail, isDone, statsFromEntries, type KaihEntry } from '@/lib/kaih';

const db = supabase as any;

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string | null;
  studentName: string;
  className?: string | null;
  startDate: string;
  endDate: string;
}

/** Rincian jurnal satu siswa untuk wali kelas / kesiswaan (hanya baca). */
export function KaihStudentDetailDialog({ open, onClose, studentId, studentName, className, startDate, endDate }: Props) {
  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['kaih-monitor-entries', studentId, startDate, endDate],
    queryFn: () =>
      fetchAllRows<KaihEntry>((from, to) =>
        db.from('kaih_journals').select('*').eq('student_id', studentId).gte('entry_date', startDate).lte('entry_date', endDate).order('entry_date', { ascending: false }).range(from, to),
      ),
    enabled: open && !!studentId,
  });
  const { stats, overall } = useMemo(() => statsFromEntries(entries), [entries]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{studentName}{className ? ` • ${className}` : ''}</DialogTitle>
          <DialogDescription>
            {fmtDateLong(startDate)} – {fmtDateLong(endDate)} • {entries.length} jurnal • rata-rata {fmtPct(overall)}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memuat…</div>
        ) : error ? (
          <p className="py-6 text-sm text-destructive">{(error as Error).message}</p>
        ) : (
          <div className="space-y-4">
            <KaihPercentChart stats={stats} total={entries.length} height={260} />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                    {HABITS.map((h) => (
                      <TableHead key={h.key} className="text-center" title={`${h.no}. ${h.label}`}>
                        <h.icon className="mx-auto h-4 w-4" style={{ color: h.color }} aria-label={h.label} />
                      </TableHead>
                    ))}
                    <TableHead className="text-center">Jumlah</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow><TableCell colSpan={HABITS.length + 3} className="py-6 text-center text-muted-foreground">Belum ada jurnal pada periode ini.</TableCell></TableRow>
                  ) : (
                    entries.map((e) => (
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
                        <TableCell className="text-center"><Badge variant={e.habit_count === 7 ? 'default' : 'secondary'}>{e.habit_count}/7</Badge></TableCell>
                        <TableCell className="max-w-[16rem] text-xs text-muted-foreground">{e.notes || '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
