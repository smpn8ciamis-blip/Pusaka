import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Download, FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { snpDb, type SnpRkaBatch, type SnpRkaItem } from '@/hooks/usePenjabSnp';
import {
  amountPerMonth, formatMonths, formatRupiah, MONTH_SHORT, parseRkaRows, type RkaRow,
} from '@/lib/rkaParser';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#64748b'];
const compact = (n: number) =>
  new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function RkaTab({ standardId, standardName }: { standardId: string; standardName: string }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ rows: RkaRow[]; fileName: string; skipped: number; warnings: string[] } | null>(null);
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [deleteTarget, setDeleteTarget] = useState<SnpRkaBatch | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['snp-rka-batches', standardId],
    queryFn: async (): Promise<SnpRkaBatch[]> => {
      const { data, error } = await snpDb
        .from('snp_rka_batches').select('*').eq('standard_id', standardId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SnpRkaBatch[];
    },
  });

  const activeBatch = batches.find((b) => b.id === batchId) ?? batches[0] ?? null;

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['snp-rka-items', activeBatch?.id],
    enabled: !!activeBatch,
    queryFn: async (): Promise<SnpRkaItem[]> => {
      const all: SnpRkaItem[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await snpDb
          .from('snp_rka_items').select('*').eq('batch_id', activeBatch!.id)
          .order('line_no', { ascending: true, nullsFirst: false }).range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...((data ?? []) as SnpRkaItem[]));
        if (!data || data.length < PAGE) break;
      }
      return all;
    },
  });

  const perMonth = useMemo(() => amountPerMonth(items.map((i) => ({ amount: Number(i.amount), months: i.months ?? [] }))), [items]);
  const monthData = useMemo(() => {
    const d = MONTH_SHORT.map((m, i) => ({ bulan: m, jumlah: Math.round(perMonth[i]) }));
    if (perMonth[12] > 0) d.push({ bulan: 'Tanpa bulan', jumlah: Math.round(perMonth[12]) });
    return d;
  }, [perMonth]);

  const byActivity = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => map.set(i.activity_name, (map.get(i.activity_name) ?? 0) + Number(i.amount)));
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [items]);
  const topActivities = byActivity.slice(0, 8);
  const otherSum = byActivity.slice(8).reduce((a, b) => a + b.value, 0);
  const pieData = otherSum > 0 ? [...topActivities, { name: 'Lainnya', value: otherSum }] : topActivities;

  const total = items.reduce((a, i) => a + Number(i.amount), 0);
  const peak = monthData.filter((m) => m.bulan !== 'Tanpa bulan').reduce((a, b) => (b.jumlah > a.jumlah ? b : a), { bulan: '-', jumlah: 0 });

  const handleFile = async (file: File) => {
    try {
      if (file.size > 10 * 1024 * 1024) { toast.error('Ukuran file maksimal 10 MB'); return; }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      let best: { rows: RkaRow[]; skipped: number; warnings: string[] } | null = null;
      for (const name of wb.SheetNames) {
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
        const res = parseRkaRows(aoa);
        if (!best || res.rows.length > best.rows.length) best = res;
      }
      if (!best || best.rows.length === 0) {
        toast.error('Tidak ada baris kegiatan yang terbaca. Pastikan format kolom sesuai template.');
        return;
      }
      setPreview({ ...best, fileName: file.name });
    } catch (e) {
      console.error(e);
      toast.error('Gagal membaca file Excel');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      const totalAmount = preview.rows.reduce((a, r) => a + r.amount, 0);
      const { data: batch, error } = await snpDb
        .from('snp_rka_batches')
        .insert({ standard_id: standardId, fiscal_year: fiscalYear.trim() || null, file_name: preview.fileName, row_count: preview.rows.length, total_amount: totalAmount })
        .select('*').single();
      if (error) throw error;
      try {
        const CHUNK = 200;
        for (let i = 0; i < preview.rows.length; i += CHUNK) {
          const rows = preview.rows.slice(i, i + CHUNK).map((r) => ({
            batch_id: batch.id, standard_id: standardId, line_no: r.line_no, activity_name: r.activity_name,
            description: r.description || null, volume: r.volume, unit: r.unit || null, unit_price: r.unit_price,
            amount: r.amount, months: r.months, month_label: r.month_label || null,
          }));
          const { error: e2 } = await snpDb.from('snp_rka_items').insert(rows);
          if (e2) throw e2;
        }
      } catch (e) {
        await snpDb.from('snp_rka_batches').delete().eq('id', batch.id); // batalkan batch setengah jadi
        throw e;
      }
      return batch.id as string;
    },
    onSuccess: (id) => {
      toast.success(`${preview?.rows.length ?? 0} baris RKA berhasil diimport`);
      setPreview(null);
      if (id) setBatchId(id);
      queryClient.invalidateQueries({ queryKey: ['snp-rka-batches'] });
      queryClient.invalidateQueries({ queryKey: ['snp-overview'] });
    },
    onError: () => toast.error('Gagal mengimport RKA'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (b: SnpRkaBatch) => {
      const { error } = await snpDb.from('snp_rka_batches').delete().eq('id', b.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Data RKA dihapus');
      setDeleteTarget(null);
      setBatchId(null);
      queryClient.invalidateQueries({ queryKey: ['snp-rka-batches'] });
      queryClient.invalidateQueries({ queryKey: ['snp-rka-items'] });
      queryClient.invalidateQueries({ queryKey: ['snp-overview'] });
    },
    onError: () => toast.error('Gagal menghapus data RKA'),
  });

  const downloadTemplate = () => {
    const aoa = [
      ['No', 'Nama Kegiatan', 'Uraian', 'Volume', 'Satuan', 'Harga Satuan', 'Jumlah', 'Bulan Kegiatan'],
      [1, 'Workshop Pengembangan Kurikulum', 'Honor narasumber', 2, 'kali', 1500000, 3000000, 'Juli'],
      [2, 'Pengadaan Buku Paket', 'Buku pegangan guru', 100, 'buku', 50000, 5000000, 'Jan-Mar'],
      [3, 'Rapat Evaluasi', 'Konsumsi rapat', 12, 'kali', 250000, 3000000, 'Setiap bulan'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 5 }, { wch: 34 }, { wch: 30 }, { wch: 9 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RKA');
    XLSX.writeFile(wb, 'template-rka-penjab.xlsx');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Import RKA — {standardName}</CardTitle>
          <CardDescription>
            Kolom: No, Nama Kegiatan, Uraian, Volume, Satuan, Harga Satuan, Jumlah, Bulan Kegiatan. Bulan dapat berupa
            "Juli", "Jan-Mar", "Jan, Mar, Mei", atau "Setiap bulan" (anggaran dibagi rata ke bulan tersebut pada grafik).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rka-fy">Tahun anggaran</Label>
            <Input id="rka-fy" className="w-28" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} />
          </div>
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
          <Button onClick={() => fileRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" /> Pilih File Excel</Button>
          <Button variant="outline" onClick={downloadTemplate} className="gap-2"><Download className="h-4 w-4" /> Unduh Template</Button>
        </CardContent>
      </Card>

      {preview && (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pratinjau import: {preview.fileName}</CardTitle>
            <CardDescription>
              {preview.rows.length} baris kegiatan terbaca · total {formatRupiah(preview.rows.reduce((a, r) => a + r.amount, 0))}
              {preview.skipped > 0 && ` · ${preview.skipped} baris dilewati (kosong/subtotal)`}
            </CardDescription>
            {preview.warnings.map((w) => <p key={w} className="text-xs text-amber-600">⚠ {w}</p>)}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead><TableHead>Kegiatan</TableHead><TableHead>Uraian</TableHead>
                    <TableHead className="text-right">Vol</TableHead><TableHead>Sat</TableHead>
                    <TableHead className="text-right">Harga</TableHead><TableHead className="text-right">Jumlah</TableHead><TableHead>Bulan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.line_no ?? i + 1}</TableCell>
                      <TableCell className="min-w-[160px]">{r.activity_name}</TableCell>
                      <TableCell className="min-w-[140px] text-muted-foreground">{r.description || '-'}</TableCell>
                      <TableCell className="text-right">{r.volume}</TableCell>
                      <TableCell>{r.unit || '-'}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatRupiah(r.unit_price)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatRupiah(r.amount)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatMonths(r.months)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.rows.length > 50 && <p className="text-xs text-muted-foreground">Menampilkan 50 baris pertama dari {preview.rows.length}.</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending} className="gap-2">
                {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Hasil Import
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={importMutation.isPending}>Batal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {batchesLoading ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></CardContent></Card>
      ) : !activeBatch ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Belum ada data RKA. Import file Excel untuk menampilkan grafik.</CardContent></Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-sm">Versi import:</Label>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm max-w-full"
              value={activeBatch.id}
              onChange={(e) => setBatchId(e.target.value)}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fiscal_year ? `TA ${b.fiscal_year} · ` : ''}{new Date(b.created_at).toLocaleDateString('id-ID')} · {b.file_name ?? 'import'}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={() => setDeleteTarget(activeBatch)}>
              <Trash2 className="h-4 w-4" /> Hapus versi ini
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Anggaran</p><p className="text-lg font-bold">{formatRupiah(total)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Jumlah Kegiatan</p><p className="text-lg font-bold">{items.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Bulan Terpadat</p><p className="text-lg font-bold">{peak.bulan}</p><p className="text-xs text-muted-foreground">{formatRupiah(peak.jumlah)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Kegiatan Terbesar</p><p className="text-sm font-bold line-clamp-2">{byActivity[0]?.name ?? '-'}</p><p className="text-xs text-muted-foreground">{formatRupiah(byActivity[0]?.value ?? 0)}</p></CardContent></Card>
          </div>

          {itemsLoading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Anggaran per Bulan</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthData} margin={{ left: 0, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="bulan" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={50} />
                      <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={48} />
                      <Tooltip formatter={(v: number) => formatRupiah(v)} />
                      <Bar dataKey="jumlah" name="Anggaran" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Komposisi Anggaran per Kegiatan</CardTitle></CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="75%" paddingAngle={1}>
                          {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatRupiah(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Kegiatan Terbesar</CardTitle></CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topActivities} layout="vertical" margin={{ left: 0, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)} />
                        <Tooltip formatter={(v: number) => formatRupiah(v)} />
                        <Bar dataKey="value" name="Anggaran" fill="#16a34a" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Rincian RKA</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">No</TableHead><TableHead>Nama Kegiatan</TableHead><TableHead>Uraian</TableHead>
                        <TableHead className="text-right">Volume</TableHead><TableHead>Satuan</TableHead>
                        <TableHead className="text-right">Harga Satuan</TableHead><TableHead className="text-right">Jumlah</TableHead><TableHead>Bulan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((r, i) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.line_no ?? i + 1}</TableCell>
                          <TableCell className="min-w-[160px] font-medium">{r.activity_name}</TableCell>
                          <TableCell className="min-w-[140px] text-muted-foreground">{r.description || '-'}</TableCell>
                          <TableCell className="text-right">{Number(r.volume)}</TableCell>
                          <TableCell>{r.unit || '-'}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{formatRupiah(Number(r.unit_price))}</TableCell>
                          <TableCell className="text-right whitespace-nowrap font-medium">{formatRupiah(Number(r.amount))}</TableCell>
                          <TableCell className="whitespace-nowrap"><Badge variant="outline">{formatMonths(r.months ?? [])}</Badge></TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={6} className="text-right font-semibold">Total</TableCell>
                        <TableCell className="text-right font-bold whitespace-nowrap">{formatRupiah(total)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus data RKA ini?</AlertDialogTitle>
            <AlertDialogDescription>Seluruh {deleteTarget?.row_count} baris dari import "{deleteTarget?.file_name}" akan dihapus.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
