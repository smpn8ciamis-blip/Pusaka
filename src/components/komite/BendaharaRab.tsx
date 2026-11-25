import { Fragment, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { komiteErrorMessage } from '@/hooks/useKomite';
import { useKomitePenggunaan, useKomiteRab, useKomiteRabMutations, type KomiteRabRow } from '@/hooks/useKomiteAnggaran';
import { bandingAlami, formatRupiah, parseRupiahInput } from '@/lib/komite';
import { formatVolume, parseDesimalInput } from '@/lib/komiteAnggaran';

type Form = { id?: string; kelompok: string; uraian: string; volume: string; satuan: string; harga: string; keterangan: string; urutan: number };
const kosong = (kelompok = '', urutan = 1): Form => ({ kelompok, uraian: '', volume: '1', satuan: '', harga: '', keterangan: '', urutan });

/** Dashboard bendahara komite: RAB (tambah, ubah, hapus). */
export function BendaharaRab() {
  const { data: rows = [], isLoading, isError } = useKomiteRab();
  const { data: pakai = [] } = useKomitePenggunaan();
  const { save, remove } = useKomiteRabMutations();
  const [form, setForm] = useState<Form | null>(null);
  const [hapus, setHapus] = useState<KomiteRabRow | null>(null);

  const terpakai = useMemo(() => {
    const m = new Map<string, number>();
    pakai.forEach((p) => { if (p.rab_id) m.set(p.rab_id, (m.get(p.rab_id) ?? 0) + Number(p.jumlah)); });
    return m;
  }, [pakai]);
  const groups = useMemo(() => {
    const m = new Map<string, KomiteRabRow[]>();
    rows.forEach((r) => m.set(r.kelompok, [...(m.get(r.kelompok) ?? []), r]));
    return Array.from(m.entries()).sort((a, b) => bandingAlami(a[0], b[0]));
  }, [rows]);
  const total = rows.reduce((a, r) => a + Number(r.jumlah), 0);
  const jumlahForm = Math.round(parseDesimalInput(form?.volume ?? '') * parseRupiahInput(form?.harga ?? '') * 100) / 100;

  const simpan = async () => {
    if (!form) return;
    const volume = parseDesimalInput(form.volume);
    if (!form.kelompok.trim()) return toast.error('Kelompok wajib diisi (mis. Sarana Prasarana)');
    if (!form.uraian.trim()) return toast.error('Uraian wajib diisi');
    if (!(volume > 0)) return toast.error('Volume harus lebih dari 0');
    try {
      await save.mutateAsync({
        id: form.id, kelompok: form.kelompok.trim(), uraian: form.uraian.trim(), volume,
        satuan: form.satuan.trim() || null, harga_satuan: parseRupiahInput(form.harga),
        keterangan: form.keterangan.trim() || null, urutan: form.urutan,
      });
      toast.success('RAB disimpan');
      setForm(null);
    } catch (e) { toast.error(komiteErrorMessage(e)); }
  };

  const konfirmasiHapus = async () => {
    if (!hapus) return;
    try { await remove.mutateAsync(hapus.id); toast.success('Butir RAB dihapus'); }
    catch (e) { toast.error(komiteErrorMessage(e)); }
    finally { setHapus(null); }
  };
  const hapusPakai = hapus ? pakai.filter((p) => p.rab_id === hapus.id).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Rencana Anggaran Biaya. Tampil di tab RAB halaman publik (bisa disembunyikan di tab Pengaturan).</p>
        <Button onClick={() => setForm(kosong('', rows.length + 1))}><Plus className="mr-1.5 h-4 w-4" /> Tambah Butir RAB</Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
      {isError && <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">RAB belum dapat dimuat. Pastikan migrasi <code>20261126050000_komite_rab_penggunaan.sql</code> sudah dijalankan.</p>}
      {!isLoading && !isError && rows.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Belum ada butir RAB.</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-left font-semibold">Uraian</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Volume</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Harga satuan</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Jumlah</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Terpakai</th>
                <th scope="col" className="px-3 py-2.5"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([kelompok, items]) => (
                <Fragment key={kelompok}>
                  <tr className="bg-muted/30">
                    <th scope="rowgroup" colSpan={3} className="px-3 py-2 text-left font-bold">{kelompok}</th>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{formatRupiah(items.reduce((a, r) => a + Number(r.jumlah), 0))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatRupiah(items.reduce((a, r) => a + (terpakai.get(r.id) ?? 0), 0))}</td>
                    <td />
                  </tr>
                  {items.map((r) => {
                    const p = terpakai.get(r.id) ?? 0;
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2">{r.uraian}{r.keterangan && <div className="text-xs text-muted-foreground">{r.keterangan}</div>}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatVolume(r.volume)}{r.satuan ? ` ${r.satuan}` : ''}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatRupiah(r.harga_satuan)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatRupiah(r.jumlah)}</td>
                        <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${p > Number(r.jumlah) ? 'font-semibold text-destructive' : ''}`}>{formatRupiah(p)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <Button variant="ghost" size="icon" aria-label={`Ubah ${r.uraian}`} onClick={() => setForm({ id: r.id, kelompok: r.kelompok, uraian: r.uraian, volume: formatVolume(r.volume), satuan: r.satuan ?? '', harga: Number(r.harga_satuan) ? Number(r.harga_satuan).toLocaleString('id-ID') : '', keterangan: r.keterangan ?? '', urutan: r.urutan })}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" aria-label={`Hapus ${r.uraian}`} onClick={() => setHapus(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/50 font-bold">
              <tr><td colSpan={3} className="px-3 py-3">Total RAB</td><td className="px-3 py-3 text-right tabular-nums">{formatRupiah(total)}</td><td className="px-3 py-3 text-right tabular-nums">{formatRupiah(Array.from(terpakai.values()).reduce((a, b) => a + b, 0))}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Ubah Butir RAB' : 'Tambah Butir RAB'}</DialogTitle>
            <DialogDescription>Jumlah dihitung otomatis dari volume × harga satuan.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="rab-kel">Kelompok / pos</Label>
                <Input id="rab-kel" list="rab-kelompok-list" value={form.kelompok} onChange={(e) => setForm({ ...form, kelompok: e.target.value })} placeholder="mis. Sarana Prasarana" />
                <datalist id="rab-kelompok-list">{groups.map(([k]) => <option key={k} value={k} />)}</datalist>
              </div>
              <div><Label htmlFor="rab-ur">Uraian</Label><Input id="rab-ur" value={form.uraian} onChange={(e) => setForm({ ...form, uraian: e.target.value })} placeholder="mis. Kipas angin dinding" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="rab-vol">Volume</Label><Input id="rab-vol" inputMode="decimal" value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} /></div>
                <div><Label htmlFor="rab-sat">Satuan</Label><Input id="rab-sat" value={form.satuan} onChange={(e) => setForm({ ...form, satuan: e.target.value })} placeholder="unit, buah, paket" /></div>
              </div>
              <div>
                <Label htmlFor="rab-hrg">Harga satuan (Rp)</Label>
                <Input id="rab-hrg" inputMode="numeric" value={form.harga} placeholder="0"
                  onChange={(e) => { const n = parseRupiahInput(e.target.value); setForm({ ...form, harga: n ? n.toLocaleString('id-ID') : '' }); }} />
              </div>
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">Jumlah: <b className="tabular-nums">{formatRupiah(jumlahForm)}</b></p>
              <div><Label htmlFor="rab-ket">Keterangan (opsional)</Label><Input id="rab-ket" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} /></div>
              <div><Label htmlFor="rab-urut">Urutan dalam kelompok</Label><Input id="rab-urut" type="number" className="w-24" value={form.urutan} onChange={(e) => setForm({ ...form, urutan: Number(e.target.value) || 0 })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Batal</Button>
            <Button onClick={simpan} disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!hapus} onOpenChange={(o) => !o && setHapus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus butir RAB?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{hapus?.uraian}&quot; dihapus dari RAB.
              {hapusPakai > 0 ? ` ${hapusPakai} transaksi penggunaan yang memakai butir ini tetap ada, tetapi menjadi tanpa pos RAB.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={konfirmasiHapus}>Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
