import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { FotoBarang } from '@/components/komite/FotoBarang';
import { KomitePagination } from '@/components/komite/KomitePagination';
import { komiteErrorMessage, useKomiteRingkasan } from '@/hooks/useKomite';
import { useKomitePenggunaan, useKomitePenggunaanMutations, useKomiteRab, type KomitePenggunaanRow } from '@/hooks/useKomiteAnggaran';
import { formatRupiah, formatTanggal, parseRupiahInput } from '@/lib/komite';
import { cocok, fotoUrl, formatVolume, KOMITE_FOTO_MAKS_MB, parseDesimalInput } from '@/lib/komiteAnggaran';

type Form = {
  id?: string; tanggal: string; uraian: string; rab_id: string; penerima: string; volume: string; satuan: string;
  jumlah: string; keterangan: string; fotoLama: string | null;
};
const hariIni = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // tanggal WIB
const kosong = (): Form => ({ tanggal: hariIni(), uraian: '', rab_id: 'none', penerima: '', volume: '1', satuan: '', jumlah: '', keterangan: '', fotoLama: null });
const FOTO_TIPE = ['image/jpeg', 'image/png', 'image/webp'];

/** Dashboard bendahara komite: penggunaan dana / transaksi belanja (tambah, ubah, hapus) dengan foto barang opsional. */
export function BendaharaPenggunaan() {
  const { data: rows = [], isLoading, isError } = useKomitePenggunaan();
  const { data: rab = [] } = useKomiteRab();
  const { data: ringkasan } = useKomiteRingkasan();
  const { save, remove } = useKomitePenggunaanMutations();
  const [form, setForm] = useState<Form | null>(null);
  const [fotoBaru, setFotoBaru] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [buangFoto, setBuangFoto] = useState(false);
  const [hapus, setHapus] = useState<KomitePenggunaanRow | null>(null);
  const [q, setQ] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pratinjau foto baru dari berkas lokal; dibersihkan saat diganti/ditutup.
  useEffect(() => {
    if (!fotoBaru) { setFotoPreview(null); return; }
    const u = URL.createObjectURL(fotoBaru);
    setFotoPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [fotoBaru]);

  const rabById = useMemo(() => new Map(rab.map((r) => [r.id, r])), [rab]);
  const terpakaiPos = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((p) => { if (p.rab_id) m.set(p.rab_id, (m.get(p.rab_id) ?? 0) + Number(p.jumlah)); });
    return m;
  }, [rows]);
  const total = rows.reduce((a, r) => a + Number(r.jumlah), 0);
  const terkumpul = Number(ringkasan?.total ?? 0);

  const filtered = useMemo(() => {
    const needle = q.trim();
    if (!needle) return rows;
    return rows.filter((r) => cocok(r.uraian, needle) || cocok(r.penerima, needle) || cocok(r.keterangan, needle) || cocok(rabById.get(r.rab_id ?? '')?.uraian, needle));
  }, [rows, q, rabById]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const view = filtered.slice((cur - 1) * pageSize, cur * pageSize);

  const bukaForm = (f: Form) => { setForm(f); setFotoBaru(null); setBuangFoto(false); };
  const tutupForm = () => { setForm(null); setFotoBaru(null); setBuangFoto(false); };

  const pilihFoto = (file: File | undefined) => {
    if (!file) return;
    if (!FOTO_TIPE.includes(file.type)) return toast.error('Foto harus berformat JPG, PNG, atau WebP');
    if (file.size > 25 * 1024 * 1024) return toast.error('Ukuran foto terlalu besar (maksimal 25 MB sebelum dikompres)');
    setFotoBaru(file);
    setBuangFoto(false);
  };

  const simpan = async () => {
    if (!form) return;
    const volume = parseDesimalInput(form.volume);
    const jumlah = parseRupiahInput(form.jumlah);
    if (!form.uraian.trim()) return toast.error('Nama barang / uraian belanja wajib diisi');
    if (!form.tanggal) return toast.error('Tanggal wajib diisi');
    if (!(volume > 0)) return toast.error('Volume harus lebih dari 0');
    if (!(jumlah > 0)) return toast.error('Jumlah belanja harus lebih dari 0');
    try {
      await save.mutateAsync({
        id: form.id, tanggal: form.tanggal, uraian: form.uraian.trim(), rab_id: form.rab_id === 'none' ? null : form.rab_id,
        penerima: form.penerima.trim() || null, volume, satuan: form.satuan.trim() || null, jumlah,
        keterangan: form.keterangan.trim() || null, fotoLama: form.fotoLama, fotoBaru, buangFoto,
      });
      toast.success('Transaksi disimpan');
      tutupForm();
    } catch (e) { toast.error(komiteErrorMessage(e)); }
  };

  const konfirmasiHapus = async () => {
    if (!hapus) return;
    try { await remove.mutateAsync({ id: hapus.id, foto_path: hapus.foto_path }); toast.success('Transaksi dihapus'); }
    catch (e) { toast.error(komiteErrorMessage(e)); }
    finally { setHapus(null); }
  };

  const pos = form && form.rab_id !== 'none' ? rabById.get(form.rab_id) : undefined;
  const fotoTampil = fotoPreview ?? (!buangFoto ? fotoUrl(form?.fotoLama) : null);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Dana terkumpul</div><div className="text-xl font-bold tabular-nums">{formatRupiah(terkumpul)}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Sudah dibelanjakan</div><div className="text-xl font-bold tabular-nums">{formatRupiah(total)}</div><div className="text-xs text-muted-foreground">{rows.length} transaksi</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">{terkumpul - total >= 0 ? 'Sisa dana' : 'Belanja melebihi dana'}</div><div className={`text-xl font-bold tabular-nums ${terkumpul - total >= 0 ? 'text-emerald-700' : 'text-destructive'}`}>{formatRupiah(Math.abs(terkumpul - total))}</div></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari barang, toko, atau pos" aria-label="Cari transaksi" className="pl-9" type="search" />
        </div>
        <Button onClick={() => bukaForm(kosong())}><Plus className="mr-1.5 h-4 w-4" /> Tambah Transaksi</Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
      {isError && <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">Data belum dapat dimuat. Pastikan migrasi <code>20261126050000_komite_rab_penggunaan.sql</code> sudah dijalankan.</p>}
      {!isLoading && !isError && rows.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Belum ada transaksi belanja.</p>}

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Tanggal</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Barang / belanja</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Pos RAB</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Jumlah</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Foto</th>
                  <th scope="col" className="px-3 py-2.5"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {view.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Tidak ada transaksi yang cocok.</td></tr>}
                {view.map((r) => {
                  const p = r.rab_id ? rabById.get(r.rab_id) : undefined;
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2">{formatTanggal(r.tanggal)}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.uraian}</div>
                        <div className="text-xs text-muted-foreground">{formatVolume(r.volume)}{r.satuan ? ` ${r.satuan}` : ''}{r.penerima ? ` · ${r.penerima}` : ''}</div>
                        {r.keterangan && <div className="text-xs text-muted-foreground">{r.keterangan}</div>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{p ? <>{p.kelompok}<div className="text-xs">{p.uraian}</div></> : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatRupiah(r.jumlah)}</td>
                      <td className="px-3 py-2"><FotoBarang path={r.foto_path} judul={r.uraian} ukuran="h-10 w-10" /></td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Button variant="ghost" size="icon" aria-label={`Ubah ${r.uraian}`} onClick={() => bukaForm({ id: r.id, tanggal: r.tanggal, uraian: r.uraian, rab_id: r.rab_id ?? 'none', penerima: r.penerima ?? '', volume: formatVolume(r.volume), satuan: r.satuan ?? '', jumlah: Number(r.jumlah).toLocaleString('id-ID'), keterangan: r.keterangan ?? '', fotoLama: r.foto_path })}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Hapus ${r.uraian}`} onClick={() => setHapus(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <KomitePagination total={filtered.length} page={cur} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        </>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && tutupForm()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Ubah Transaksi Belanja' : 'Tambah Transaksi Belanja'}</DialogTitle>
            <DialogDescription>Tampil di tab Penggunaan halaman publik. Foto barang bersifat opsional.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="pg-tgl">Tanggal belanja</Label><Input id="pg-tgl" type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} /></div>
                <div>
                  <Label htmlFor="pg-jml">Total belanja (Rp)</Label>
                  <Input id="pg-jml" inputMode="numeric" value={form.jumlah} placeholder="0"
                    onChange={(e) => { const n = parseRupiahInput(e.target.value); setForm({ ...form, jumlah: n ? n.toLocaleString('id-ID') : '' }); }} />
                </div>
              </div>
              <div><Label htmlFor="pg-ur">Nama barang / uraian belanja</Label><Input id="pg-ur" value={form.uraian} onChange={(e) => setForm({ ...form, uraian: e.target.value })} placeholder="mis. Kipas angin dinding" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="pg-vol">Volume</Label><Input id="pg-vol" inputMode="decimal" value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} /></div>
                <div><Label htmlFor="pg-sat">Satuan</Label><Input id="pg-sat" value={form.satuan} onChange={(e) => setForm({ ...form, satuan: e.target.value })} placeholder="unit, buah, paket" /></div>
              </div>
              <div>
                <Label htmlFor="pg-pos">Pos RAB (opsional)</Label>
                <Select value={form.rab_id} onValueChange={(v) => setForm({ ...form, rab_id: v })}>
                  <SelectTrigger id="pg-pos"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">Tanpa pos RAB</SelectItem>
                    {rab.map((r) => <SelectItem key={r.id} value={r.id}>{r.kelompok} - {r.uraian}</SelectItem>)}
                  </SelectContent>
                </Select>
                {pos && <p className="mt-1 text-xs text-muted-foreground">Anggaran pos ini {formatRupiah(pos.jumlah)}; sudah terpakai {formatRupiah((terpakaiPos.get(pos.id) ?? 0) - (form.id ? Number(rows.find((x) => x.id === form.id && x.rab_id === pos.id)?.jumlah ?? 0) : 0))}.</p>}
              </div>
              <div><Label htmlFor="pg-toko">Toko / penyedia (opsional)</Label><Input id="pg-toko" value={form.penerima} onChange={(e) => setForm({ ...form, penerima: e.target.value })} /></div>
              <div><Label htmlFor="pg-ket">Keterangan (opsional)</Label><Textarea id="pg-ket" rows={2} value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} /></div>

              <div>
                <Label htmlFor="pg-foto">Foto barang (opsional)</Label>
                <input
                  ref={fileRef} id="pg-foto" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                  onChange={(e) => { pilihFoto(e.target.files?.[0]); e.target.value = ''; }}
                />
                {fotoTampil ? (
                  <div className="mt-1.5 flex items-start gap-3">
                    <img src={fotoTampil} alt="Pratinjau foto barang" className="h-24 w-24 rounded-lg border object-cover" />
                    <div className="flex flex-col gap-1.5">
                      <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><ImagePlus className="mr-1.5 h-4 w-4" /> Ganti foto</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setFotoBaru(null); setBuangFoto(true); }}><X className="mr-1.5 h-4 w-4" /> Hapus foto</Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="mt-1.5" onClick={() => fileRef.current?.click()}><ImagePlus className="mr-1.5 h-4 w-4" /> Pilih foto</Button>
                )}
                <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, atau WebP. Foto dikecilkan otomatis (maks. {KOMITE_FOTO_MAKS_MB} MB setelah dikompres) dan akan tampil publik di halaman Komite.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={tutupForm}>Batal</Button>
            <Button onClick={simpan} disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!hapus} onOpenChange={(o) => !o && setHapus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi?</AlertDialogTitle>
            <AlertDialogDescription>&quot;{hapus?.uraian}&quot; ({formatRupiah(hapus?.jumlah)}) dihapus{hapus?.foto_path ? ' beserta fotonya' : ''}. Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={konfirmasiHapus}>Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
