import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DataPagination } from '@/components/ui/data-pagination';
import {
  komiteErrorMessage, useKomiteDonasi, useKomiteDonasiMutations, useKomiteRekening, useKomiteStudents,
  type DonasiFilter, type KomiteDonasiRow,
} from '@/hooks/useKomite';
import { KATEGORI_LABEL, SUMBER_LABEL, formatRupiah, formatTanggal, parseRupiahInput } from '@/lib/komite';

const hariIni = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

interface FormState {
  id?: string;
  tanggal: string;
  jumlah: string;          // teks berformat ribuan
  sumber: 'rekening' | 'tunai';
  kategori: 'siswa' | 'donatur_lain';
  tingkat: 'all' | '7' | '8' | '9';
  student_id: string;
  nama: string;
  rekening_id: string;     // '' = tidak dipilih
  keterangan: string;
}

const kosong = (): FormState => ({
  tanggal: hariIni(), jumlah: '', sumber: 'tunai', kategori: 'siswa', tingkat: 'all',
  student_id: '', nama: '', rekening_id: '', keterangan: '',
});

const fromRow = (r: KomiteDonasiRow): FormState => ({
  id: r.id, tanggal: r.tanggal, jumlah: Number(r.jumlah).toLocaleString('id-ID'), sumber: r.sumber, kategori: r.kategori,
  tingkat: r.grade ? (String(r.grade) as FormState['tingkat']) : 'all',
  student_id: r.student_id ?? '', nama: r.nama, rekening_id: r.rekening_id ?? '', keterangan: r.keterangan ?? '',
});

function DonasiDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: FormState }) {
  const [f, setF] = useState<FormState>(initial);
  useEffect(() => { if (open) setF(initial); }, [open, initial]);
  const { save } = useKomiteDonasiMutations();
  const { data: students = [], isLoading: loadingStudents } = useKomiteStudents(open);
  const { data: rekening = [] } = useKomiteRekening();

  const opsiSiswa = useMemo(
    () => students
      .filter((s) => f.tingkat === 'all' || String(s.grade) === f.tingkat)
      .map((s) => ({ value: s.student_id, label: s.nama, description: `${s.kelas} · NIS ${s.nis}`, keywords: `${s.nis} ${s.kelas}` })),
    [students, f.tingkat],
  );

  const jumlah = parseRupiahInput(f.jumlah);
  const edit = !!f.id;
  const siswaYatim = f.kategori === 'siswa' && edit && !f.student_id; // siswa sudah dihapus dari data induk

  const submit = async () => {
    if (jumlah <= 0) return toast.error('Jumlah harus lebih dari 0');
    if (f.kategori === 'siswa' && !f.student_id && !siswaYatim) return toast.error('Pilih siswa penyumbang');
    if (f.kategori === 'donatur_lain' && !f.nama.trim()) return toast.error('Nama donatur wajib diisi');
    try {
      await save.mutateAsync({
        id: f.id, tanggal: f.tanggal, jumlah, sumber: f.sumber, kategori: f.kategori,
        student_id: f.kategori === 'siswa' ? (f.student_id || null) : null,
        nama: f.kategori === 'siswa' ? (opsiSiswa.find((o) => o.value === f.student_id)?.label ?? f.nama) : f.nama.trim(),
        rekening_id: f.sumber === 'rekening' && f.rekening_id ? f.rekening_id : null,
        keterangan: f.keterangan,
      });
      toast.success(edit ? 'Catatan diperbarui' : 'Pendapatan dicatat');
      onOpenChange(false);
    } catch (e) {
      toast.error(komiteErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{edit ? 'Ubah Catatan Pendapatan' : 'Catat Pendapatan'}</DialogTitle>
          <DialogDescription>Sumbangan siswa dicatat per tingkat kelas; selain itu catat sebagai donatur lainnya.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Asal pendapatan</Label>
              <Select value={f.kategori} onValueChange={(v) => setF({ ...f, kategori: v as FormState['kategori'], student_id: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="siswa">Siswa (per tingkat kelas)</SelectItem>
                  <SelectItem value="donatur_lain">Donatur lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="kd-tanggal">Tanggal</Label>
              <Input id="kd-tanggal" type="date" value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value })} />
            </div>
          </div>

          {f.kategori === 'siswa' ? (
            <div className="space-y-3">
              <div>
                <Label>Tingkat kelas</Label>
                <Select value={f.tingkat} onValueChange={(v) => setF({ ...f, tingkat: v as FormState['tingkat'], student_id: '' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua tingkat</SelectItem>
                    <SelectItem value="7">Kelas 7</SelectItem>
                    <SelectItem value="8">Kelas 8</SelectItem>
                    <SelectItem value="9">Kelas 9</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Siswa</Label>
                {siswaYatim ? (
                  <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{f.nama} <span className="text-muted-foreground">(data siswa sudah tidak ada)</span></p>
                ) : (
                  <SearchableSelect
                    options={opsiSiswa}
                    value={f.student_id}
                    onValueChange={(v) => setF({ ...f, student_id: v })}
                    placeholder="Cari nama / NIS siswa…"
                    searchPlaceholder="Ketik nama atau NIS"
                    emptyMessage="Siswa tidak ditemukan"
                    loading={loadingStudents}
                  />
                )}
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="kd-nama">Nama donatur</Label>
              <Input id="kd-nama" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} placeholder="Nama orang tua / perusahaan / instansi" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="kd-jumlah">Jumlah (Rp)</Label>
              <Input
                id="kd-jumlah" inputMode="numeric" value={f.jumlah} placeholder="0"
                onChange={(e) => { const n = parseRupiahInput(e.target.value); setF({ ...f, jumlah: n ? n.toLocaleString('id-ID') : '' }); }}
              />
            </div>
            <div>
              <Label>Sumber dana</Label>
              <Select value={f.sumber} onValueChange={(v) => setF({ ...f, sumber: v as FormState['sumber'], rekening_id: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tunai">Tunai</SelectItem>
                  <SelectItem value="rekening">Rekening (transfer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {f.sumber === 'rekening' && rekening.length > 0 && (
            <div>
              <Label>Masuk ke rekening (opsional)</Label>
              <Select value={f.rekening_id || 'none'} onValueChange={(v) => setF({ ...f, rekening_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tidak dipilih</SelectItem>
                  {rekening.map((r) => <SelectItem key={r.id} value={r.id}>{r.bank} · {r.nomor}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="kd-ket">Keterangan (internal, tidak tampil di halaman publik)</Label>
            <Textarea id="kd-ket" rows={2} value={f.keterangan} onChange={(e) => setF({ ...f, keterangan: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BendaharaPendapatan() {
  const [filter, setFilter] = useState<DonasiFilter>({ kategori: 'all', grade: 'all', sumber: 'all', search: '' });
  const [searchTxt, setSearchTxt] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dlg, setDlg] = useState<{ open: boolean; initial: FormState }>({ open: false, initial: kosong() });
  const [hapus, setHapus] = useState<KomiteDonasiRow | null>(null);
  const { remove } = useKomiteDonasiMutations();

  // pencarian ditunda agar tidak memanggil server di setiap ketukan
  useEffect(() => {
    const t = setTimeout(() => { setFilter((f) => (f.search === searchTxt ? f : { ...f, search: searchTxt })); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchTxt]);

  const { data, isLoading, isError, error } = useKomiteDonasi(filter, page, pageSize);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setF = (patch: Partial<DonasiFilter>) => { setFilter((f) => ({ ...f, ...patch })); setPage(1); };

  const konfirmasiHapus = async () => {
    if (!hapus) return;
    try {
      await remove.mutateAsync(hapus.id);
      toast.success('Catatan dihapus');
    } catch (e) {
      toast.error(komiteErrorMessage(e));
    } finally {
      setHapus(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-9" placeholder="Cari nama penyumbang…" value={searchTxt} onChange={(e) => setSearchTxt(e.target.value)} aria-label="Cari nama penyumbang" />
        </div>
        <Select value={filter.kategori === 'donatur_lain' ? 'lain' : filter.grade === 'all' ? 'all' : String(filter.grade)}
          onValueChange={(v) => {
            if (v === 'all') setF({ kategori: 'all', grade: 'all' });
            else if (v === 'lain') setF({ kategori: 'donatur_lain', grade: 'all' });
            else setF({ kategori: 'siswa', grade: Number(v) as 7 | 8 | 9 });
          }}>
          <SelectTrigger className="w-[160px]" aria-label="Filter asal"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua asal</SelectItem>
            <SelectItem value="7">Siswa kelas 7</SelectItem>
            <SelectItem value="8">Siswa kelas 8</SelectItem>
            <SelectItem value="9">Siswa kelas 9</SelectItem>
            <SelectItem value="lain">Donatur lainnya</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter.sumber} onValueChange={(v) => setF({ sumber: v as DonasiFilter['sumber'] })}>
          <SelectTrigger className="w-[140px]" aria-label="Filter sumber"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua sumber</SelectItem>
            <SelectItem value="rekening">Rekening</SelectItem>
            <SelectItem value="tunai">Tunai</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setDlg({ open: true, initial: kosong() })}><Plus className="mr-1.5 h-4 w-4" /> Catat Pendapatan</Button>
      </div>

      {isError && <p className="text-sm text-destructive">Gagal memuat: {komiteErrorMessage(error)}</p>}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Penyumbang</TableHead>
              <TableHead>Asal</TableHead>
              <TableHead>Sumber</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead className="w-[90px] text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Memuat…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Belum ada catatan.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatTanggal(r.tanggal)}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.nama}</div>
                  {r.keterangan && <div className="text-xs text-muted-foreground">{r.keterangan}</div>}
                </TableCell>
                <TableCell>{r.kategori === 'siswa' ? `Siswa kelas ${r.grade}` : KATEGORI_LABEL.donatur_lain}</TableCell>
                <TableCell><Badge variant={r.sumber === 'rekening' ? 'default' : 'secondary'}>{SUMBER_LABEL[r.sumber]}</Badge></TableCell>
                <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatRupiah(r.jumlah)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" aria-label={`Ubah catatan ${r.nama}`} onClick={() => setDlg({ open: true, initial: fromRow(r) })}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Hapus catatan ${r.nama}`} onClick={() => setHapus(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DataPagination
        currentPage={page} totalPages={totalPages} totalItems={total} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} pageSizeOptions={[10, 25, 50]}
      />

      <DonasiDialog open={dlg.open} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} initial={dlg.initial} />

      <AlertDialog open={!!hapus} onOpenChange={(o) => !o && setHapus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus catatan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {hapus && <>Catatan <b>{hapus.nama}</b> sebesar <b>{formatRupiah(hapus.jumlah)}</b> akan dihapus permanen dan total penggalangan dana ikut berkurang.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={konfirmasiHapus}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
