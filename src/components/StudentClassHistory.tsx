import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { History, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type HistoryRow = {
  id: string; student_id: string; academic_year: string; class_name: string; grade: number | null;
  outcome: 'aktif' | 'naik' | 'tinggal' | 'lulus'; to_class_name: string | null; recorded_at: string;
  students?: { nis: string; full_name: string } | null;
};

const OUTCOME_LABEL: Record<string, string> = { aktif: 'Berjalan', naik: 'Naik kelas', tinggal: 'Tinggal kelas', lulus: 'Lulus' };
const outcomeVariant = (o: string) => (o === 'tinggal' ? 'destructive' : o === 'lulus' ? 'default' : o === 'naik' ? 'secondary' : 'outline') as any;
const yearLabel = (y: string) => y || 'Tanpa tahun ajaran';

/** Riwayat rombel satu siswa dari tahun ke tahun (ikon di baris tabel siswa). */
export const StudentClassHistoryButton = ({ studentId, studentName }: { studentId: string; studentName: string }) => {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['student-class-history', 'student', studentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_class_history' as any).select('*')
        .eq('student_id', studentId).order('academic_year');
      if (error) throw error;
      return (data ?? []) as unknown as HistoryRow[];
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Riwayat rombel"><History className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Riwayat Rombel - {studentName}</DialogTitle></DialogHeader>
        {isLoading ? <p className="text-sm text-muted-foreground">Memuat...</p> : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada riwayat rombel.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Tahun Ajaran</TableHead><TableHead>Rombel</TableHead><TableHead>Hasil</TableHead><TableHead>Tujuan</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data!.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{yearLabel(r.academic_year)}</TableCell>
                  <TableCell>{r.class_name}</TableCell>
                  <TableCell><Badge variant={outcomeVariant(r.outcome)}>{OUTCOME_LABEL[r.outcome]}</Badge></TableCell>
                  <TableCell>{r.to_class_name ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** Laporan rombel per tahun pelajaran (siapa di kelas mana & hasilnya), bisa diunduh Excel. */
export const ClassHistoryReportDialog = () => {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');

  const { data: years } = useQuery({
    queryKey: ['student-class-history', 'years'],
    enabled: open,
    queryFn: async () => {
      const set = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('student_class_history' as any).select('academic_year').range(from, from + 999);
        if (error) throw error;
        (data ?? []).forEach((r: any) => set.add(r.academic_year));
        if (!data || data.length < 1000) break;
      }
      return Array.from(set).sort().reverse();
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['student-class-history', 'year', year],
    enabled: open && !!year,
    queryFn: async () => {
      const all: HistoryRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('student_class_history' as any)
          .select('id, student_id, academic_year, class_name, grade, outcome, to_class_name, recorded_at, students(nis, full_name)')
          .eq('academic_year', year === '__none__' ? '' : year).order('class_name').range(from, from + 999);
        if (error) throw error;
        all.push(...((data ?? []) as unknown as HistoryRow[]));
        if (!data || data.length < 1000) break;
      }
      return all.sort((a, b) =>
        a.class_name.localeCompare(b.class_name, 'id', { numeric: true }) ||
        (a.students?.full_name ?? '').localeCompare(b.students?.full_name ?? '', 'id'));
    },
  });

  const q = search.trim().toLowerCase();
  const filtered = (rows ?? []).filter(r =>
    !q || r.class_name.toLowerCase().includes(q) || (r.students?.full_name ?? '').toLowerCase().includes(q) || (r.students?.nis ?? '').includes(q));
  const counts = (rows ?? []).reduce<Record<string, number>>((m, r) => ({ ...m, [r.outcome]: (m[r.outcome] ?? 0) + 1 }), {});

  const exportXlsx = () => {
    const data = filtered.map((r, i) => ({
      No: i + 1, NIS: r.students?.nis ?? '', Nama: r.students?.full_name ?? '', 'Tahun Ajaran': yearLabel(r.academic_year),
      Rombel: r.class_name, Hasil: OUTCOME_LABEL[r.outcome], Tujuan: r.to_class_name ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Rombel');
    XLSX.writeFile(wb, `riwayat-rombel-${year.replace(/\//g, '-') || 'semua'}.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><History className="mr-2 h-4 w-4" />Riwayat Rombel</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Riwayat Rombel per Tahun Pelajaran</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Tahun Pelajaran</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue placeholder="Pilih tahun pelajaran" /></SelectTrigger>
              <SelectContent>
                {(years ?? []).map(y => <SelectItem key={y || 'none'} value={y || '__none__'}>{yearLabel(y)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Cari rombel / nama / NIS</Label>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="mis. 8A atau nama siswa" />
          </div>
        </div>
        {year && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Total {rows?.length ?? 0} siswa:</span>
            {Object.entries(counts).map(([k, v]) => <Badge key={k} variant={outcomeVariant(k)}>{OUTCOME_LABEL[k]} {v}</Badge>)}
            <Button size="sm" variant="outline" className="ml-auto" onClick={exportXlsx} disabled={filtered.length === 0}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />Excel
            </Button>
          </div>
        )}
        {!year ? <p className="text-sm text-muted-foreground">Pilih tahun pelajaran untuk melihat siapa berada di rombel mana dan hasil akhir tahunnya.</p>
          : isLoading ? <p className="text-sm text-muted-foreground">Memuat...</p> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Rombel</TableHead><TableHead>NIS</TableHead><TableHead>Nama</TableHead><TableHead>Hasil</TableHead><TableHead>Tujuan</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Tidak ada data</TableCell></TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.class_name}</TableCell>
                  <TableCell>{r.students?.nis}</TableCell>
                  <TableCell>{r.students?.full_name}</TableCell>
                  <TableCell><Badge variant={outcomeVariant(r.outcome)}>{OUTCOME_LABEL[r.outcome]}</Badge></TableCell>
                  <TableCell>{r.to_class_name ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
};
