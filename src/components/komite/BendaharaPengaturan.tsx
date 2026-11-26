import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { komiteErrorMessage, useKomiteSettings, useSaveKomiteSettings, type KomiteSettingsRow } from '@/hooks/useKomite';
import { NAMA_PUBLIK_LABEL, parseRupiahInput } from '@/lib/komite';

export function BendaharaPengaturan() {
  const { data, isLoading } = useKomiteSettings();
  const save = useSaveKomiteSettings();
  const [judul, setJudul] = useState('Penggalangan Dana Komite');
  const [deskripsi, setDeskripsi] = useState('');
  const [target, setTarget] = useState('');
  const [batas, setBatas] = useState('');
  const [namaPublik, setNamaPublik] = useState<KomiteSettingsRow['nama_publik']>('inisial');
  const [rincian, setRincian] = useState(true);
  const [tampilRab, setTampilRab] = useState(true);
  const [tampilPakai, setTampilPakai] = useState(true);
  // Kolom baru hanya ikut disimpan bila sudah ada di basis data (migrasi sudah dijalankan).
  const adaKolomAnggaran = !!data && 'tampilkan_rab' in data;

  useEffect(() => {
    if (!data) return;
    setJudul(data.judul);
    setDeskripsi(data.deskripsi ?? '');
    setTarget(Number(data.target) ? Number(data.target).toLocaleString('id-ID') : '');
    setBatas(data.batas_waktu ?? '');
    setNamaPublik(data.nama_publik);
    setRincian(data.tampilkan_rincian);
    setTampilRab(data.tampilkan_rab ?? true);
    setTampilPakai(data.tampilkan_penggunaan ?? true);
  }, [data]);

  const simpan = async () => {
    if (!judul.trim()) return toast.error('Judul wajib diisi');
    try {
      await save.mutateAsync({
        judul: judul.trim(), deskripsi: deskripsi.trim() || null, target: parseRupiahInput(target),
        batas_waktu: batas || null, nama_publik: namaPublik, tampilkan_rincian: rincian,
        ...(adaKolomAnggaran ? { tampilkan_rab: tampilRab, tampilkan_penggunaan: tampilPakai } : {}),
      });
      toast.success('Pengaturan disimpan');
    } catch (e) {
      toast.error(komiteErrorMessage(e));
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Memuat…</p>;

  return (
    <div className="max-w-xl space-y-4">
      {!data && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Penggalangan dana belum dibuka. Halaman publik baru tampil setelah pengaturan ini disimpan.</p>}
      <div><Label htmlFor="ps-judul">Judul penggalangan dana</Label><Input id="ps-judul" value={judul} onChange={(e) => setJudul(e.target.value)} /></div>
      <div><Label htmlFor="ps-desk">Deskripsi / tujuan (tampil di bagian atas halaman publik)</Label><Textarea id="ps-desk" rows={3} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ps-target">Rencana Kebutuhan (Rp)</Label>
          <Input id="ps-target" inputMode="numeric" value={target} placeholder="0"
            onChange={(e) => { const n = parseRupiahInput(e.target.value); setTarget(n ? n.toLocaleString('id-ID') : ''); }} />
        </div>
        <div><Label htmlFor="ps-batas">Batas waktu (opsional)</Label><Input id="ps-batas" type="date" value={batas} onChange={(e) => setBatas(e.target.value)} /></div>
      </div>
      <div>
        <Label>Penulisan nama penyumbang di halaman publik</Label>
        <Select value={namaPublik} onValueChange={(v) => setNamaPublik(v as KomiteSettingsRow['nama_publik'])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(NAMA_PUBLIK_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">Sebagian besar penyumbang adalah siswa di bawah umur, sehingga bawaannya disamarkan menjadi inisial.</p>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
        <span>Tampilkan tab <b>Rincian</b> (daftar catatan) di halaman publik</span>
        <Switch checked={rincian} onCheckedChange={setRincian} />
      </label>
      {adaKolomAnggaran && (
        <>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>Tampilkan tab <b>RAB</b> di halaman publik</span>
            <Switch checked={tampilRab} onCheckedChange={setTampilRab} aria-label="Tampilkan tab RAB" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>Tampilkan tab <b>Penggunaan</b> (transaksi belanja dan foto barang) di halaman publik</span>
            <Switch checked={tampilPakai} onCheckedChange={setTampilPakai} aria-label="Tampilkan tab Penggunaan" />
          </label>
        </>
      )}
      <Button onClick={simpan} disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan Pengaturan'}</Button>
    </div>
  );
}
