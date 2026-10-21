import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowRight, Eye, FileSpreadsheet, FileText, Loader2, Printer, Wallet } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { snpDb, useSnpStandards, type SnpAssignment, type SnpRkaBatch } from '@/hooks/usePenjabSnp';
import { amountPerMonth, formatRupiah, MONTH_SHORT } from '@/lib/rkaParser';
import { buildAllRkaPdf, exportAllRkaXlsx, type PenjabBudgetRow, type RevenueSummary } from '@/lib/rkaReport';
import { revenuePerMonth, useSchoolRevenues } from '@/hooks/useSchoolRevenues';
import { SchoolRevenueCard } from '@/components/penjab/SchoolRevenueCard';
import type { PaperSize } from '@/lib/journalReport';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
const compact = (n: number) => new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const ALL_YEARS = 'all';

interface Raw {
  batches: SnpRkaBatch[];
  assignments: SnpAssignment[];
  items: Array<{ batch_id: string; standard_id: string; amount: number; months: number[] }>;
}

export default function AnggaranPenjab() {
  const { data: standards = [], isLoading: stdLoading } = useSnpStandards();
  const [year, setYear] = useState<string>(ALL_YEARS);
  const [paper, setPaper] = useState<PaperSize>('a4');
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['anggaran-penjab'],
    queryFn: async (): Promise<Raw> => {
      const [b, a] = await Promise.all([
        snpDb.from('snp_rka_batches').select('*').order('created_at', { ascending: false }),
        snpDb.rpc('snp_get_assignments'),
      ]);
      if (b.error) throw b.error;
      if (a.error) throw a.error;
      const batches = (b.data ?? []) as SnpRkaBatch[];
      // Hanya versi terbaru tiap standar+tahun yang dimuat rinciannya
      const latest = new Map<string, SnpRkaBatch>();
      batches.forEach((x) => { const k = `${x.standard_id}|${x.fiscal_year ?? ''}`; if (!latest.has(k)) latest.set(k, x); });
      const ids = Array.from(latest.values()).map((x) => x.id);
      const items: Raw['items'] = [];
      for (let i = 0; i < ids.length; i += 20) {
        const chunk = ids.slice(i, i + 20);
        for (let from = 0; ; from += 1000) {
          const { data, error } = await snpDb.from('snp_rka_items').select('batch_id, standard_id, amount, months').in('batch_id', chunk).range(from, from + 999);
          if (error) throw error;
          items.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
      }
      return { batches, assignments: (a.data ?? []) as SnpAssignment[], items };
    },
  });

  const { data: allRevenues = [] } = useSchoolRevenues();

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => (await supabase.from('school_settings').select('*').limit(1).maybeSingle()).data,
    staleTime: 5 * 60 * 1000,
  });

  const years = useMemo(() => Array.from(new Set([...(raw?.batches ?? []).map((b) => b.fiscal_year), ...allRevenues.map((r) => r.fiscal_year)].filter(Boolean) as string[])).sort().reverse(), [raw, allRevenues]);
  useEffect(() => { if (year === ALL_YEARS && years.length > 0) setYear(years[0]); }, [years]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows: (PenjabBudgetRow & { id: string; lastDate: string | null; hasData: boolean })[] = useMemo(() => {
    if (!raw) return [];
    return standards.map((s) => {
      const cand = raw.batches.filter((b) => b.standard_id === s.id && (year === ALL_YEARS || (b.fiscal_year ?? '') === year));
      const batch = cand[0]; // terbaru
      const its = batch ? raw.items.filter((i) => i.batch_id === batch.id) : [];
      const pm = amountPerMonth(its.map((i) => ({ amount: Number(i.amount), months: i.months ?? [] })));
      const names = raw.assignments.filter((a) => a.standard_id === s.id).map((a) => a.full_name);
      return {
        id: s.id, code: s.code, name: s.name, penjab: names.join(', '),
        version: batch ? `${batch.fiscal_year ? 'TA ' + batch.fiscal_year + ' · ' : ''}${batch.file_name ?? 'manual'}` : '',
        count: its.length, total: its.reduce((a, i) => a + Number(i.amount), 0), months: pm,
        lastDate: batch?.created_at ?? null, hasData: !!batch,
      };
    });
  }, [raw, standards, year]);

  const grand = rows.reduce((a, r) => a + r.total, 0);
  const revenues = useMemo(() => allRevenues.filter((r) => year === ALL_YEARS || r.fiscal_year === year), [allRevenues, year]);
  const revenueTotal = revenues.reduce((a, r) => a + r.amount, 0);
  const revenueMonths = useMemo(() => revenuePerMonth(revenues), [revenues]);
  const balance = revenueTotal - grand;
  const yearSelected = year !== ALL_YEARS;
  const revenueSummary: RevenueSummary | null = revenues.length > 0 || yearSelected ? { items: revenues, total: revenueTotal, months: revenueMonths } : null;
  const withData = rows.filter((r) => r.hasData).length;
  const monthTotals = useMemo(() => {
    const t = new Array(13).fill(0);
    rows.forEach((r) => r.months.forEach((v, i) => { t[i] += v; }));
    return t;
  }, [rows]);
  const peakIdx = monthTotals.slice(0, 12).reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);
  const topStd = rows.reduce<typeof rows[number] | null>((b, r) => (!b || r.total > b.total ? r : b), null);
  const noPenjab = rows.filter((r) => !r.penjab).length;

  const monthChart = MONTH_SHORT.map((m, i) => {
    const o: Record<string, number | string> = { bulan: m };
    rows.forEach((r) => { o[r.code] = Math.round(r.months[i]); });
    return o;
  });
  const cashChart = (() => {
    let cum = 0;
    return MONTH_SHORT.map((m, i) => {
      const net = revenueMonths[i] - monthTotals[i]; cum += net;
      return { bulan: m, penerimaan: Math.round(revenueMonths[i]), belanja: Math.round(monthTotals[i]), saldo: Math.round(cum) };
    });
  })();
  const pie = rows.filter((r) => r.total > 0).map((r) => ({ name: r.name, value: r.total }));
  const short = (n: string) => n.replace(/^Standar\s+/i, '');

  const fy = year === ALL_YEARS ? null : year;
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); toast.error('Gagal memproses dokumen'); } finally { setBusy(false); }
  };
  const mkPdf = () => buildAllRkaPdf({ rows, fiscalYear: fy, paper, settings: schoolSettings as any, revenue: yearSelected ? revenueSummary : null });
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const doPreview = () => run(async () => setPreviewUrl(URL.createObjectURL((await mkPdf()).output('blob'))));
  const doPdf = () => run(async () => { (await mkPdf()).save(`rekap-anggaran-penjab${fy ? '-' + fy : ''}.pdf`); });
  const doPrint = () => run(async () => {
    const doc = await mkPdf(); doc.autoPrint();
    const url = URL.createObjectURL(doc.output('blob'));
    if (!window.open(url, '_blank')) toast.error('Pop-up diblokir. Gunakan Pratinjau atau Unduh PDF.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  const doXlsx = () => run(() => exportAllRkaXlsx({ rows, fiscalYear: fy, revenue: yearSelected ? revenueSummary : null }));

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2"><Wallet className="h-6 w-6" /> Anggaran Penjab</h1>
            <p className="text-muted-foreground">Rekap RKA seluruh penanggung jawab standar. Admin dan bendahara dapat melihat dan mengelola semua anggaran.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tahun anggaran" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_YEARS}>Semua tahun</SelectItem>
                {years.map((y) => <SelectItem key={y} value={y}>TA {y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={paper} onValueChange={(v) => setPaper(v as PaperSize)}>
              <SelectTrigger className="w-[84px]" title="Ukuran kertas"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="a4">A4</SelectItem><SelectItem value="f4">F4</SelectItem></SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doPreview} disabled={busy || !withData}><Eye className="h-4 w-4" /> Pratinjau</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doPrint} disabled={busy || !withData}><Printer className="h-4 w-4" /> Cetak</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doPdf} disabled={busy || !withData}><FileText className="h-4 w-4" /> PDF</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doXlsx} disabled={busy || !withData}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          </div>
        </div>

        {stdLoading || isLoading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Anggaran Semua Penjab</p><p className="text-lg font-bold">{formatRupiah(Math.round(grand))}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Standar Sudah Ada RKA</p><p className="text-lg font-bold">{withData} / {rows.length}</p>{rows.length - withData > 0 && <p className="text-xs text-amber-600">{rows.length - withData} belum</p>}</CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Bulan Terpadat</p><p className="text-lg font-bold">{grand > 0 ? MONTH_SHORT[peakIdx] : '-'}</p><p className="text-xs text-muted-foreground">{formatRupiah(Math.round(monthTotals[peakIdx] ?? 0))}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Standar Terbesar</p><p className="text-sm font-bold line-clamp-2">{topStd && topStd.total > 0 ? short(topStd.name) : '-'}</p><p className="text-xs text-muted-foreground">{formatRupiah(Math.round(topStd?.total ?? 0))}</p></CardContent></Card>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Penerimaan Sekolah</p><p className="text-lg font-bold text-emerald-600">{formatRupiah(Math.round(revenueTotal))}</p><p className="text-xs text-muted-foreground">{revenues.length} sumber{yearSelected ? ` · TA ${year}` : ''}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Anggaran Belanja Semua Penjab</p><p className="text-lg font-bold">{formatRupiah(Math.round(grand))}</p><p className="text-xs text-muted-foreground">{revenueTotal > 0 ? `${((grand / revenueTotal) * 100).toFixed(1)}% dari penerimaan` : 'Belum ada penerimaan'}</p></CardContent></Card>
              <Card className={balance < 0 ? 'border-destructive/50' : 'border-emerald-500/40'}><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Selisih (Penerimaan − Belanja)</p>
                <p className={`text-lg font-bold ${balance < 0 ? 'text-destructive' : 'text-emerald-600'}`}>{formatRupiah(Math.round(balance))}</p>
                <p className={`text-xs ${balance < 0 ? 'text-destructive' : 'text-emerald-600'}`}>{revenueTotal === 0 && grand === 0 ? '-' : balance < 0 ? 'Defisit: belanja melebihi penerimaan' : 'Surplus'}</p>
              </CardContent></Card>
            </div>
            {!yearSelected && <p className="text-xs text-amber-600">Pilih satu tahun anggaran agar selisih dihitung dengan tepat (anggaran belanja memakai RKA terbaru tiap standar).</p>}
            <SchoolRevenueCard fiscalYear={yearSelected ? year : null} rows={revenues} />

            {noPenjab > 0 && <p className="text-xs text-amber-600">{noPenjab} standar belum memiliki penjab (atur di menu Penjab Standar → Kelola).</p>}

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Anggaran per Penjab / Standar</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Standar</TableHead><TableHead>Penjab</TableHead><TableHead>Versi RKA</TableHead>
                      <TableHead className="text-right">Rincian</TableHead><TableHead className="text-right">Total Anggaran</TableHead>
                      <TableHead className="min-w-[110px]">Porsi</TableHead><TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="min-w-[180px] font-medium">{r.name}</TableCell>
                        <TableCell className="min-w-[140px] text-muted-foreground">{r.penjab || <span className="text-amber-600">Belum ada</span>}</TableCell>
                        <TableCell className="min-w-[140px]">{r.hasData ? <span className="text-sm">{r.version}</span> : <Badge variant="outline">Belum ada RKA</Badge>}</TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                        <TableCell className="text-right whitespace-nowrap font-medium">{formatRupiah(Math.round(r.total))}</TableCell>
                        <TableCell>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${grand > 0 ? (r.total / grand) * 100 : 0}%` }} /></div>
                          <span className="text-[11px] text-muted-foreground">{grand > 0 ? ((r.total / grand) * 100).toFixed(1) : '0.0'}%</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline" className="gap-1"><Link to={`/anggaran-penjab/${r.code}`}>Kelola <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold">{rows.reduce((a, r) => a + r.count, 0)}</TableCell>
                      <TableCell className="text-right font-bold whitespace-nowrap">{formatRupiah(Math.round(grand))}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {grand > 0 && (
              <>
                {(revenueTotal > 0 || grand > 0) && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Penerimaan vs Belanja per Bulan</CardTitle></CardHeader>
                    <CardContent className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={cashChart} margin={{ left: 0, right: 8, top: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={48} />
                          <Tooltip formatter={(v: number) => formatRupiah(v)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="penerimaan" name="Penerimaan" fill="#16a34a" />
                          <Bar dataKey="belanja" name="Belanja" fill="#dc2626" />
                          <Line type="monotone" dataKey="saldo" name="Saldo kumulatif" stroke="#2563eb" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Anggaran per Bulan (per Standar)</CardTitle></CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthChart} margin={{ left: 0, right: 8, top: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={48} />
                        <Tooltip formatter={(v: number) => formatRupiah(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {rows.map((r, i) => <Bar key={r.id} dataKey={r.code} name={short(r.name)} stackId="a" fill={COLORS[i % COLORS.length]} />)}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Komposisi Anggaran</CardTitle></CardHeader>
                    <CardContent className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pie} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="75%" paddingAngle={1}>
                            {pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatRupiah(v)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => { const s = short(v); return s.length > 24 ? `${s.slice(0, 23)}…` : s; }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Total per Standar</CardTitle></CardHeader>
                    <CardContent className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={rows.map((r) => ({ name: short(r.name), value: Math.round(r.total) }))} layout="vertical" margin={{ left: 0, right: 12 }}>
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
                  <CardHeader className="pb-2"><CardTitle className="text-base">Matriks Standar × Bulan</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[160px]">Standar</TableHead>
                          {MONTH_SHORT.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{short(r.name)}</TableCell>
                            {r.months.slice(0, 12).map((v, i) => (
                              <TableCell key={i} className="text-right whitespace-nowrap text-xs" style={v > 0 ? { backgroundColor: `rgba(37,99,235,${Math.min(0.35, (v / Math.max(1, ...monthTotals.slice(0, 12))) * 0.9)})` } : undefined}>
                                {v > 0 ? compact(v) : '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/40 font-semibold">
                          <TableCell>Total</TableCell>
                          {monthTotals.slice(0, 12).map((v, i) => <TableCell key={i} className="text-right whitespace-nowrap text-xs">{v > 0 ? compact(v) : '-'}</TableCell>)}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) setPreviewUrl(null); }}>
        <DialogContent className="max-w-5xl h-[90dvh] flex flex-col">
          <DialogHeader><DialogTitle>Pratinjau Rekap Anggaran Penjab</DialogTitle></DialogHeader>
          {previewUrl && <iframe src={previewUrl} title="Pratinjau" className="min-h-0 w-full flex-1 rounded border" />}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreviewUrl(null)}>Tutup</Button>
            <Button onClick={doPdf} disabled={busy} className="gap-1.5"><FileText className="h-4 w-4" /> Unduh PDF</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
