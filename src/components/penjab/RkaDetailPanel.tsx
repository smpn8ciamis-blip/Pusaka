import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Eye, FileSpreadsheet, FileText, Loader2, Printer, Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataPagination } from '@/components/ui/data-pagination';
import { formatMonths, formatRupiah, MONTH_SHORT } from '@/lib/rkaParser';
import {
  buildMonthEntries, buildRkaPdf, exportRkaCsv, exportRkaXlsx, monthTitle, NO_MONTH, summarizeMonths,
  type RkaItemLite, type RkaPdfMode,
} from '@/lib/rkaReport';
import type { PaperSize } from '@/lib/journalReport';

type SortKey = 'urut' | 'besar' | 'kecil' | 'nama';
const SORT_LABEL: Record<SortKey, string> = { urut: 'Urutan RKA', besar: 'Anggaran terbesar', kecil: 'Anggaran terkecil', nama: 'Nama kegiatan A–Z' };
const ALL = 'all';

interface Props {
  items: RkaItemLite[];
  standardName: string;
  fiscalYear?: string | null;
  penjabName?: string | null;
}

const lc = (s: unknown) => String(s ?? '').toLowerCase();

export function RkaDetailPanel({ items, standardName, fiscalYear, penjabName }: Props) {
  const [view, setView] = useState<'bulan' | 'semua'>('bulan');
  const [month, setMonth] = useState<number | 'all'>(() => Math.min(new Date().getMonth(), 11));
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState<string>(ALL);
  const [sort, setSort] = useState<SortKey>('urut');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paper, setPaper] = useState<PaperSize>(() => {
    try { return (localStorage.getItem('rka-paper') as PaperSize) || 'a4'; } catch { return 'a4'; }
  });
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const setPaperPersist = (p: PaperSize) => { setPaper(p); try { localStorage.setItem('rka-paper', p); } catch { /* abaikan */ } };
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => { setPage(1); }, [search, activity, sort, month, view, pageSize]);

  const activities = useMemo(() => Array.from(new Set(items.map((i) => i.activity_name))).sort((a, b) => a.localeCompare(b, 'id')), [items]);

  // Item yang lolos pencarian + filter kegiatan (dasar untuk kedua tampilan, PDF, dan Excel)
  const filteredItems = useMemo(() => {
    const q = lc(search).trim();
    return items.filter((i) => {
      if (activity !== ALL && i.activity_name !== activity) return false;
      if (!q) return true;
      return lc(i.activity_name).includes(q) || lc(i.description).includes(q) || lc(i.unit).includes(q) || lc(i.amount).includes(q) || lc(formatMonths(i.months ?? [])).includes(q);
    });
  }, [items, search, activity]);

  const allEntries = useMemo(() => buildMonthEntries(items), [items]);
  const summary = useMemo(() => summarizeMonths(allEntries), [allEntries]);
  const grand = useMemo(() => items.reduce((a, i) => a + (Number(i.amount) || 0), 0), [items]);
  const maxMonth = Math.max(1, ...summary.map((r) => r.total));
  const filteredEntries = useMemo(() => buildMonthEntries(filteredItems), [filteredItems]);

  // Baris tabel untuk tampilan terpilih
  type Row = { key: string; bulan: string; item: RkaItemLite; share: number; spread: number };
  const rows: Row[] = useMemo(() => {
    let out: Row[] = [];
    if (view === 'bulan') {
      const idxs = month === 'all' ? filteredEntries.map((_, i) => i) : [month];
      idxs.forEach((idx) => filteredEntries[idx].forEach((e, n) => out.push({ key: `${idx}-${e.item.id ?? n}-${n}`, bulan: monthTitle(idx), item: e.item, share: e.share, spread: e.spread })));
    } else {
      out = filteredItems.map((i, n) => ({ key: `${i.id ?? n}`, bulan: formatMonths(i.months ?? []), item: i, share: Number(i.amount) || 0, spread: (i.months ?? []).length }));
    }
    const orig = new Map(items.map((i, n) => [i, n]));
    if (sort === 'besar') out.sort((a, b) => b.share - a.share);
    else if (sort === 'kecil') out.sort((a, b) => a.share - b.share);
    else if (sort === 'nama') out.sort((a, b) => a.item.activity_name.localeCompare(b.item.activity_name, 'id') || (orig.get(a.item) ?? 0) - (orig.get(b.item) ?? 0));
    return out;
  }, [view, month, filteredEntries, filteredItems, sort, items]);

  const rowsTotal = rows.reduce((a, r) => a + r.share, 0);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const curSummary = month === 'all' ? null : summary.find((r) => r.idx === month) ?? null;
  const hasNoMonth = allEntries[NO_MONTH].length > 0;

  const filterLines = useMemo(() => {
    const l: string[] = [];
    if (view === 'bulan') l.push(`Bulan: ${month === 'all' ? 'Semua bulan' : monthTitle(month)}`);
    if (activity !== ALL) l.push(`Kegiatan: ${activity}`);
    if (search.trim()) l.push(`Pencarian: "${search.trim()}"`);
    return l;
  }, [view, month, activity, search]);

  const pdfMode: RkaPdfMode = view === 'semua' ? 'rincian' : month === 'all' ? 'semua-bulan' : 'bulan';

  const makePdf = async () => buildRkaPdf({
    mode: pdfMode, items: filteredItems, monthIdx: month === 'all' ? 0 : month, standardName, fiscalYear, paper,
    settings: schoolSettings as any, filterLines, penjabName,
  });

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); toast.error('Gagal memproses dokumen'); } finally { setBusy(false); }
  };

  const fileBase = `rka-${standardName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}${view === 'bulan' && month !== 'all' ? '-' + monthTitle(month).toLowerCase() : ''}`;
  const doPreview = () => run(async () => {
    const doc = await makePdf();
    setPreviewUrl(URL.createObjectURL(doc.output('blob')));
  });
  const doDownload = () => run(async () => { (await makePdf()).save(`${fileBase}.pdf`); });
  const doPrint = () => run(async () => {
    const doc = await makePdf();
    doc.autoPrint();
    const url = URL.createObjectURL(doc.output('blob'));
    const w = window.open(url, '_blank');
    if (!w) { toast.error('Pop-up diblokir. Izinkan pop-up atau gunakan Pratinjau/Unduh PDF.'); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  const doExcel = () => run(() => exportRkaXlsx({ items: filteredItems, standardName, fiscalYear }));
  const doCsv = () => exportRkaCsv({ rows: rows.map((r) => ({ bulan: r.bulan, item: r.item, share: r.share })), fileName: `${fileBase}.csv` });

  const noData = items.length === 0;

  return (
    <div className="space-y-4">
      <Tabs value={view} onValueChange={(v) => setView(v as 'bulan' | 'semua')}>
        <TabsList>
          <TabsTrigger value="bulan">Rincian per Bulan</TabsTrigger>
          <TabsTrigger value="semua">Semua Rincian</TabsTrigger>
        </TabsList>

        <TabsContent value="bulan" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Anggaran Tiap Bulan</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              <button
                type="button" onClick={() => setMonth('all')}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${month === 'all' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <span className="font-medium">Semua bulan</span>
                <span className="text-muted-foreground">{items.length} rincian · <span className="font-semibold text-foreground">{formatRupiah(grand)}</span></span>
              </button>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {summary.map((r) => (
                  <button
                    key={r.idx} type="button" onClick={() => setMonth(r.idx)} disabled={r.count === 0}
                    className={`rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${month === r.idx ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.idx === NO_MONTH ? 'Tanpa bulan' : MONTH_SHORT[r.idx]}</span>
                      <span className="text-xs text-muted-foreground">{r.count} kegiatan</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold">{formatRupiah(Math.round(r.total))}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(r.total / maxMonth) * 100}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {month !== 'all' && curSummary && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Anggaran {monthTitle(month)}</p><p className="text-lg font-bold">{formatRupiah(Math.round(curSummary.total))}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Jumlah Kegiatan</p><p className="text-lg font-bold">{curSummary.count}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Porsi dari Total</p><p className="text-lg font-bold">{curSummary.pct.toFixed(1)}%</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Kumulatif s.d. bulan ini</p><p className="text-lg font-bold">{formatRupiah(Math.round(curSummary.cumulative))}</p></CardContent></Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="semua" />
      </Tabs>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {view === 'bulan' ? `Kegiatan ${month === 'all' ? 'Semua Bulan' : 'Bulan ' + monthTitle(month)}` : 'Semua Rincian RKA'}
          </CardTitle>
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kegiatan, uraian, satuan, nominal…" className="pl-8 pr-8" />
              {search && (
                <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')} className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={activity} onValueChange={setActivity}>
              <SelectTrigger className="md:w-56"><SelectValue placeholder="Semua kegiatan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua kegiatan</SelectItem>
                {activities.map((a) => <SelectItem key={a} value={a}>{a.length > 40 ? a.slice(0, 39) + '…' : a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={paper} onValueChange={(v) => setPaperPersist(v as PaperSize)}>
              <SelectTrigger className="w-[88px]" title="Ukuran kertas"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="a4">A4</SelectItem><SelectItem value="f4">F4</SelectItem></SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doPreview} disabled={busy || noData}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Pratinjau
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doPrint} disabled={busy || noData}><Printer className="h-4 w-4" /> Cetak</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doDownload} disabled={busy || noData}><FileText className="h-4 w-4" /> PDF</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doExcel} disabled={busy || noData}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doCsv} disabled={noData || rows.length === 0}><Download className="h-4 w-4" /> CSV</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {rows.length} baris{(search || activity !== ALL) && ` (dari ${view === 'bulan' ? 'hasil filter' : items.length + ' rincian'})`} · Total {formatRupiah(Math.round(rowsTotal))}. PDF & Excel mengikuti pencarian dan filter aktif.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  {(view === 'semua' || month === 'all') && <TableHead>Bulan</TableHead>}
                  <TableHead>Kegiatan</TableHead><TableHead>Uraian</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Harga Satuan</TableHead>
                  {view === 'bulan' && <TableHead className="text-right">Total Item</TableHead>}
                  <TableHead className="text-right">{view === 'bulan' ? 'Anggaran Bulan Ini' : 'Jumlah'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">{noData ? 'Belum ada data.' : 'Tidak ada kegiatan yang cocok.'}</TableCell></TableRow>
                ) : pageRows.map((r, i) => (
                  <TableRow key={r.key}>
                    <TableCell>{(safePage - 1) * pageSize + i + 1}</TableCell>
                    {(view === 'semua' || month === 'all') && <TableCell className="whitespace-nowrap"><Badge variant="outline">{r.bulan}</Badge></TableCell>}
                    <TableCell className="min-w-[150px] font-medium">{r.item.activity_name}</TableCell>
                    <TableCell className="min-w-[140px] text-muted-foreground">{r.item.description || '-'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{Number(r.item.volume) || 0}{r.item.unit ? ` ${r.item.unit}` : ''}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatRupiah(Number(r.item.unit_price) || 0)}</TableCell>
                    {view === 'bulan' && <TableCell className="text-right whitespace-nowrap text-muted-foreground">{formatRupiah(Number(r.item.amount) || 0)}</TableCell>}
                    <TableCell className="text-right whitespace-nowrap font-medium">
                      {formatRupiah(Math.round(r.share))}
                      {view === 'bulan' && r.spread > 1 && <span className="block text-[10px] font-normal text-muted-foreground">1/{r.spread} dari total</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length > 0 && (
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={(view === 'bulan' ? 6 : 5) + (view === 'semua' || month === 'all' ? 1 : 0)} className="text-right font-semibold">
                      Total {view === 'bulan' && month !== 'all' ? monthTitle(month) : ''}{(search || activity !== ALL) ? ' (hasil filter)' : ''}
                    </TableCell>
                    <TableCell className="text-right font-bold whitespace-nowrap">{formatRupiah(Math.round(rowsTotal))}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DataPagination
            currentPage={safePage} totalPages={totalPages} totalItems={rows.length} pageSize={pageSize}
            onPageChange={setPage} onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) setPreviewUrl(null); }}>
        <DialogContent className="max-w-5xl h-[90dvh] flex flex-col">
          <DialogHeader><DialogTitle>Pratinjau {view === 'bulan' ? 'Rincian per Bulan' : 'Rincian RKA'}</DialogTitle></DialogHeader>
          {previewUrl && <iframe src={previewUrl} title="Pratinjau RKA" className="min-h-0 w-full flex-1 rounded border" />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setPreviewUrl(null)}>Tutup</Button>
            <Button onClick={doDownload} disabled={busy} className="gap-1.5"><FileText className="h-4 w-4" /> Unduh PDF</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
