import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { komiteErrorMessage, useKomiteRekening, useKomiteRekeningMutations, type KomiteRekeningRow } from '@/hooks/useKomite';

type Form = { id?: string; bank: string; nomor: string; atas_nama: string; catatan: string; urutan: number; aktif: boolean };
const kosong = (urutan: number): Form => ({ bank: '', nomor: '', atas_nama: '', catatan: '', urutan, aktif: true });

export function BendaharaRekening() {
  const { data: rows = [], isLoading } = useKomiteRekening();
  const { save, remove } = useKomiteRekeningMutations();
  const [form, setForm] = useState<Form | null>(null);
  const [hapus, setHapus] = useState<KomiteRekeningRow | null>(null);

  const simpan = async () => {
    if (!form) return;
    if (!form.bank.trim() || !form.nomor.trim() || !form.atas_nama.trim()) return toast.error('Bank, nomor rekening, dan atas nama wajib diisi');
    try {
      await save.mutateAsync({
        id: form.id, bank: form.bank.trim(), nomor: form.nomor.trim(), atas_nama: form.atas_nama.trim(),
        catatan: form.catatan.trim() || null, urutan: form.urutan, aktif: form.aktif,
      });
      toast.success('Rekening disimpan');
      setForm(null);
    } catch (e) {
      toast.error(komiteErrorMessage(e));
    }
  };

  const konfirmasiHapus = async () => {
    if (!hapus) return;
    try { await remove.mutateAsync(hapus.id); toast.success('Rekening dihapus'); }
    catch (e) { toast.error(komiteErrorMessage(e)); }
    finally { setHapus(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Rekening aktif tampil di halaman publik Komite.</p>
        <Button onClick={() => setForm(kosong(rows.length + 1))}><Plus className="mr-1.5 h-4 w-4" /> Tambah Rekening</Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
      {!isLoading && rows.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Belum ada rekening.</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{r.bank}</div>
                <div className="font-mono text-lg">{r.nomor}</div>
                <div className="text-sm text-muted-foreground">a.n. {r.atas_nama}</div>
                {r.catatan && <div className="mt-1 text-xs text-muted-foreground">{r.catatan}</div>}
              </div>
              <Badge variant={r.aktif ? 'default' : 'secondary'}>{r.aktif ? 'Tampil' : 'Disembunyikan'}</Badge>
            </div>
            <div className="mt-3 flex justify-end gap-1">
              <Button variant="ghost" size="icon" aria-label={`Ubah rekening ${r.bank}`} onClick={() => setForm({ id: r.id, bank: r.bank, nomor: r.nomor, atas_nama: r.atas_nama, catatan: r.catatan ?? '', urutan: r.urutan, aktif: r.aktif })}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label={`Hapus rekening ${r.bank}`} onClick={() => setHapus(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{form?.id ? 'Ubah Rekening' : 'Tambah Rekening'}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label htmlFor="rk-bank">Bank</Label><Input id="rk-bank" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} placeholder="mis. BRI" /></div>
              <div><Label htmlFor="rk-no">Nomor rekening</Label><Input id="rk-no" inputMode="numeric" value={form.nomor} onChange={(e) => setForm({ ...form, nomor: e.target.value })} /></div>
              <div><Label htmlFor="rk-an">Atas nama</Label><Input id="rk-an" value={form.atas_nama} onChange={(e) => setForm({ ...form, atas_nama: e.target.value })} /></div>
              <div><Label htmlFor="rk-cat">Catatan (opsional)</Label><Input id="rk-cat" value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} placeholder="mis. Cantumkan nama siswa & kelas pada berita transfer" /></div>
              <div className="flex items-center justify-between gap-3">
                <div><Label htmlFor="rk-urut">Urutan</Label><Input id="rk-urut" type="number" className="w-24" value={form.urutan} onChange={(e) => setForm({ ...form, urutan: Number(e.target.value) || 0 })} /></div>
                <label className="flex items-center gap-2 text-sm"><Switch checked={form.aktif} onCheckedChange={(v) => setForm({ ...form, aktif: v })} /> Tampilkan di halaman publik</label>
              </div>
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
            <AlertDialogTitle>Hapus rekening?</AlertDialogTitle>
            <AlertDialogDescription>Rekening {hapus?.bank} {hapus?.nomor} dihapus. Catatan pendapatan yang memakainya tetap ada (tanpa rekening).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={konfirmasiHapus}>Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
