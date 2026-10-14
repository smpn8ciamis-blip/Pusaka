import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataPagination } from '@/components/ui/data-pagination';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { snpDb, type SnpRkaBatch, type SnpRkaItem } from '@/hooks/usePenjabSnp';
import { formatMonths, formatRupiah, MONTH_SHORT, parseNumber } from '@/lib/rkaParser';

interface FormState {
  id?: string;
  activity_name: string;
  description: string;
  volume: string;
  unit: string;
  unit_price: string;
  amount: string;
  autoAmount: boolean;
  months: number[];
}
const emptyForm = (): FormState => ({ activity_name: '', description: '', volume: '1', unit: '', unit_price: '0', amount: '0', autoAmount: true, months: [] });

/** CRUD rincian RKA (tambah, ubah, hapus, hapus massal) + ubah info versi RKA. */
export function RkaCrudPanel({ batch, items }: { batch: SnpRkaBatch; items: SnpRkaItem[] }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [delIds, setDelIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [meta, setMeta] = useState<{ fiscal_year: string; file_name: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.activity_name} ${i.description ?? ''} ${i.unit ?? ''} ${i.amount}`.toLowerCase().includes(q));
  }, [items, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [search, pageSize, batch.id]);
  useEffect(() => { setSelected(new Set()); }, [batch.id]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['snp-rka-items'] });
    queryClient.invalidateQueries({ queryKey: ['snp-rka-batches'] });
    queryClient.invalidateQueries({ queryKey: ['snp-overview'] });
    queryClient.invalidateQueries({ queryKey: ['anggaran-penjab'] });
  };

  /** Hitung ulang jumlah baris & total anggaran versi RKA dari data terbaru. */
  const syncBatch = async () => {
    let count = 0; let total = 0;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await snpDb.from('snp_rka_items').select('amount').eq('batch_id', batch.id).range(from, from + 999);
      if (error) throw error;
      (data ?? []).forEach((r: { amount: number }) => { count++; total += Number(r.amount) || 0; });
      if (!data || data.length < 1000) break;
    }
    const { error } = await snpDb.from('snp_rka_batches').update({ row_count: count, total_amount: total }).eq('id', batch.id);
    if (error) throw error;
  };

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const volume = parseNumber(f.volume);
      const price = parseNumber(f.unit_price);
      const amount = f.autoAmount ? Math.round(volume * price * 100) / 100 : parseNumber(f.amount);
      const payload = {
        activity_name: f.activity_name.trim(),
        description: f.description.trim() || null,
        volume, unit: f.unit.trim() || null, unit_price: price, amount,
        months: [...f.months].sort((a, b) => a - b),
        month_label: formatMonths(f.months),
      };
      if (f.id) {
        const { error } = await snpDb.from('snp_rka_items').update(payload).eq('id', f.id);
        if (error) throw error;
      } else {
        const nextNo = items.reduce((m, i) => Math.max(m, i.line_no ?? 0), 0) + 1;
        const { error } = await snpDb.from('snp_rka_items').insert({ ...payload, batch_id: batch.id, standard_id: batch.standard_id, line_no: nextNo });
        if (error) throw error;
      }
      await syncBatch();
    },
    onSuccess: () => { toast.success('Rincian disimpan'); setForm(null); refresh(); },
    onError: (e: any) => toast.error(`Gagal menyimpan: ${e?.message ?? 'kesalahan'}`),
  });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await snpDb.from('snp_rka_items').delete().in('id', ids.slice(i, i + 100));
        if (error) throw error;
      }
      await syncBatch();
    },
    onSuccess: (_d, ids) => { toast.success(`${ids.length} rincian dihapus`); setDelIds(null); setSelected(new Set()); refresh(); },
    onError: () => toast.error('Gagal menghapus rincian'),
  });

  const saveMeta = useMutation({
    mutationFn: async (m: { fiscal_year: string; file_name: string }) => {
      const { error } = await snpDb.from('snp_rka_batches').update({ fiscal_year: m.fiscal_year.trim() || null, file_name: m.file_name.trim() || null }).eq('id', batch.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Info RKA diperbarui'); setMeta(null); refresh(); },
    onError: () => toast.error('Gagal memperbarui info RKA'),
  });

  const edit = (i: SnpRkaItem) => setForm({
    id: i.id, activity_name: i.activity_name, description: i.description ?? '', volume: String(i.volume), unit: i.unit ?? '',
    unit_price: String(i.unit_price), amount: String(i.amount),
    autoAmount: Math.abs(Number(i.volume) * Number(i.unit_price) - Number(i.amount)) < 0.5,
    months: i.months ?? [],
  });

  const pageIds = rows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allPageSelected) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id));
    return n;
  });
  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const previewAmount = form ? (form.autoAmount ? parseNumber(form.volume) * parseNumber(form.unit_price) : parseNumber(form.amount)) : 0;
  const valid = !!form && form.activity_name.trim().length > 0 && parseNumber(form.volume) >= 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Kelola Rincian RKA</CardTitle>
        <p className="text-xs text-muted-foreground">
          Versi: {batch.fiscal_year ? `TA ${batch.fiscal_year} · ` : ''}{batch.file_name ?? 'manual'} · {items.length} rincian · {formatRupiah(items.reduce((a, i) => a + Number(i.amount), 0))}
        </p>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari rincian…" className="pl-8" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setForm(emptyForm())}><Plus className="h-4 w-4" /> Tambah Rincian</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMeta({ fiscal_year: batch.fiscal_year ?? '', file_name: batch.file_name ?? '' })}><Pencil className="h-4 w-4" /> Ubah Info RKA</Button>
            {selected.size > 0 && (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setDelIds(Array.from(selected))}><Trash2 className="h-4 w-4" /> Hapus {selected.size} terpilih</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox checked={allPageSelected} onCheckedChange={toggleAll} aria-label="Pilih semua di halaman" /></TableHead>
                <TableHead className="w-12">No</TableHead><TableHead>Kegiatan</TableHead><TableHead>Uraian</TableHead>
                <TableHead className="text-right">Volume</TableHead><TableHead className="text-right">Harga</TableHead>
                <TableHead className="text-right">Jumlah</TableHead><TableHead>Bulan</TableHead><TableHead className="w-24 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Belum ada rincian. Klik "Tambah Rincian".</TableCell></TableRow>
              ) : rows.map((r, n) => (
                <TableRow key={r.id} data-state={selected.has(r.id) ? 'selected' : undefined}>
                  <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label="Pilih baris" /></TableCell>
                  <TableCell>{r.line_no ?? (safePage - 1) * pageSize + n + 1}</TableCell>
                  <TableCell className="min-w-[150px] font-medium">{r.activity_name}</TableCell>
                  <TableCell className="min-w-[140px] text-muted-foreground">{r.description || '-'}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{Number(r.volume)}{r.unit ? ` ${r.unit}` : ''}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatRupiah(Number(r.unit_price))}</TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">{formatRupiah(Number(r.amount))}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatMonths(r.months ?? [])}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Ubah" onClick={() => edit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Hapus" onClick={() => setDelIds([r.id])}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DataPagination currentPage={safePage} totalPages={totalPages} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o && !save.isPending) setForm(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{form?.id ? 'Ubah Rincian' : 'Tambah Rincian'}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Nama Kegiatan *</Label>
                <Input value={form.activity_name} onChange={(e) => setForm({ ...form, activity_name: e.target.value })} list="rka-activity-list" />
                <datalist id="rka-activity-list">{Array.from(new Set(items.map((i) => i.activity_name))).slice(0, 100).map((a) => <option key={a} value={a} />)}</datalist>
              </div>
              <div className="space-y-1.5"><Label>Uraian</Label>
                <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5"><Label>Volume</Label><Input inputMode="decimal" value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Satuan</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Harga Satuan</Label><Input inputMode="decimal" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Jumlah</Label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox checked={form.autoAmount} onCheckedChange={(c) => setForm({ ...form, autoAmount: c === true })} /> Hitung otomatis (Volume × Harga)
                  </label>
                </div>
                <Input inputMode="decimal" disabled={form.autoAmount} value={form.autoAmount ? String(previewAmount) : form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                <p className="text-xs text-muted-foreground">{formatRupiah(previewAmount)}</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Bulan Pelaksanaan</Label>
                  <div className="flex gap-2 text-xs">
                    <button type="button" className="text-primary hover:underline" onClick={() => setForm({ ...form, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })}>Setiap bulan</button>
                    <button type="button" className="text-muted-foreground hover:underline" onClick={() => setForm({ ...form, months: [] })}>Kosongkan</button>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {MONTH_SHORT.map((m, i) => {
                    const on = form.months.includes(i + 1);
                    return (
                      <button
                        key={m} type="button" aria-pressed={on}
                        onClick={() => setForm({ ...form, months: on ? form.months.filter((x) => x !== i + 1) : [...form.months, i + 1] })}
                        className={`rounded-md border px-1 py-1.5 text-xs transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                      >{m}</button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Anggaran dibagi rata ke bulan yang dipilih pada grafik.</p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)} disabled={save.isPending}>Batal</Button>
            <Button onClick={() => form && save.mutate(form)} disabled={!valid || save.isPending} className="gap-2">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!meta} onOpenChange={(o) => { if (!o) setMeta(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ubah Info RKA</DialogTitle></DialogHeader>
          {meta && (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Tahun Anggaran</Label><Input value={meta.fiscal_year} onChange={(e) => setMeta({ ...meta, fiscal_year: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Nama / Keterangan Versi</Label><Input value={meta.file_name} onChange={(e) => setMeta({ ...meta, file_name: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMeta(null)}>Batal</Button>
            <Button onClick={() => meta && saveMeta.mutate(meta)} disabled={saveMeta.isPending}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delIds} onOpenChange={(o) => { if (!o) setDelIds(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {delIds?.length} rincian?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini tidak dapat dibatalkan. Total anggaran versi RKA akan dihitung ulang.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => delIds && remove.mutate(delIds)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
