import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataPagination } from '@/components/ui/data-pagination';
import { KomiteDashboardSummary } from '@/components/komite/KomiteDashboardSummary';
import { useAuth } from '@/contexts/AuthContext';
import {
  komiteErrorMessage, useInputDonasiKorlas, useKomiteDonasi, useKomiteStudents, useKorlasKelas, type DonasiFilter,
} from '@/hooks/useKomite';
import { SUMBER_LABEL, formatRupiah, formatTanggal, parseRupiahInput } from '@/lib/komite';

const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const TABS = ['ringkasan', 'input', 'siswa', 'riwayat'] as const;
type Tab = (typeof TABS)[number];

function InputForm({ kelas }: { kelas: string }) {
  const { data: students = [], isLoading } = useKomiteStudents();
  const input = useInputDonasiKorlas();
  const [studentId, setStudentId] = useState('');
  const [jumlah, setJumlah] = useState('');
  const [sumber, setSumber] = useState<'rekening' | 'tunai'>('tunai');
  const [tanggal, setTanggal] = useState(hariIni());
  const [ket, setKet] = useState('');
  const [terakhir, setTerakhir] = useState<string | null>(null);

  const opsi = useMemo(
    () => students.map((s) => ({
      value: s.student_id, label: s.nama,
      description: `${s.kelas} · NIS ${s.nis}${s.total > 0 ? ` · sudah ${formatRupiah(s.total)}` : ''}`,
      keywords: `${s.nis} ${s.kelas}`,
    })),
    [students],
  );

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseRupiahInput(jumlah);
    if (!studentId) return toast.error('Pilih siswa terlebih dahulu');
    if (n <= 0) return toast.error('Jumlah harus lebih dari 0');
    try {
      await input.mutateAsync({ student_id: studentId, jumlah: n, sumber, tanggal, keterangan: ket });
      const nama = students.find((s) => s.student_id === studentId)?.nama ?? '';
      setTerakhir(`${nama} — ${formatRupiah(n)} (${SUMBER_LABEL[sumber]})`);
      toast.success('Sumbangan dicatat');
      setStudentId(''); setJumlah(''); setKet('');
    } catch (err) {
      toast.error(komiteErrorMessage(err));
    }
  };

  return (
    <form onSubmit={kirim} className="max-w-xl space-y-4 rounded-2xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">Daftar siswa hanya berisi siswa rombel {kelas}. Sumbangan untuk siswa rombel lain ditolak oleh sistem.</p>
      <div>
        <Label>Siswa rombel {kelas}</Label>
        <SearchableSelect options={opsi} value={studentId} onValueChange={setStudentId} placeholder="Cari nama / NIS siswa…" searchPlaceholder="Ketik nama atau NIS" emptyMessage="Siswa tidak ditemukan" loading={isLoading} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="kl-jumlah">Jumlah (Rp)</Label>
          <Input id="kl-jumlah" inputMode="numeric" placeholder="0" value={jumlah}
            onChange={(e) => { const n = parseRupiahInput(e.target.value); setJumlah(n ? n.toLocaleString('id-ID') : ''); }} />
        </div>
        <div>
          <Label>Sumber dana</Label>
          <Select value={sumber} onValueChange={(v) => setSumber(v as 'rekening' | 'tunai')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tunai">Tunai</SelectItem>
              <SelectItem value="rekening">Rekening (transfer)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><Label htmlFor="kl-tgl">Tanggal</Label><Input id="kl-tgl" type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></div>
      <div><Label htmlFor="kl-ket">Keterangan (opsional)</Label><Textarea id="kl-ket" rows={2} value={ket} onChange={(e) => setKet(e.target.value)} /></div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={input.isPending}>{input.isPending ? 'Menyimpan…' : 'Simpan Sumbangan'}</Button>
        {terakhir && <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden /> Tersimpan: {terakhir}</span>}
      </div>
      <p className="text-xs text-muted-foreground">Catatan yang sudah tersimpan tidak dapat diubah oleh korlas. Bila salah input, hubungi bendahara komite.</p>
    </form>
  );
}

function DaftarSiswa({ kelas }: { kelas: string }) {
  const { data: students = [], isLoading } = useKomiteStudents();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'sudah' | 'belum'>('all');
  const view = students.filter((s) =>
    (status === 'all' || (status === 'sudah' ? s.jumlah_kali > 0 : s.jumlah_kali === 0)) &&
    (!q.trim() || `${s.nama} ${s.nis} ${s.kelas}`.toLowerCase().includes(q.trim().toLowerCase())));
  const sudah = students.filter((s) => s.jumlah_kali > 0).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-9" placeholder="Cari nama / NIS / kelas…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari siswa" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-[170px]" aria-label="Filter status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua siswa</SelectItem>
            <SelectItem value="sudah">Sudah menyumbang</SelectItem>
            <SelectItem value="belum">Belum menyumbang</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">Rombel {kelas}: {sudah} dari {students.length} siswa sudah menyumbang.</p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Kelas</TableHead><TableHead>NIS</TableHead><TableHead className="text-right">Total sumbangan</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Memuat…</TableCell></TableRow>}
            {!isLoading && view.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Tidak ada siswa.</TableCell></TableRow>}
            {view.map((s) => (
              <TableRow key={s.student_id}>
                <TableCell className="font-medium">{s.nama}</TableCell>
                <TableCell>{s.kelas}</TableCell>
                <TableCell>{s.nis}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.jumlah_kali > 0 ? <span className="font-semibold">{formatRupiah(s.total)} <span className="text-xs font-normal text-muted-foreground">({s.jumlah_kali}×)</span></span> : <Badge variant="secondary">Belum</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Riwayat() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filter: DonasiFilter = { kategori: 'siswa', grade: 'all', sumber: 'all', search: '' };
  const { data, isLoading } = useKomiteDonasi(filter, page, pageSize);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Siswa</TableHead><TableHead>Sumber</TableHead><TableHead className="text-right">Jumlah</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Memuat…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada catatan.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatTanggal(r.tanggal)}</TableCell>
                <TableCell><div className="font-medium">{r.nama}</div>{r.keterangan && <div className="text-xs text-muted-foreground">{r.keterangan}</div>}</TableCell>
                <TableCell><Badge variant={r.sumber === 'rekening' ? 'default' : 'secondary'}>{SUMBER_LABEL[r.sumber]}</Badge></TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatRupiah(r.jumlah)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DataPagination currentPage={page} totalPages={Math.max(1, Math.ceil(total / pageSize))} totalItems={total} pageSize={pageSize}
        onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} pageSizeOptions={[10, 25, 50]} />
    </div>
  );
}

export default function KorlasDashboard() {
  const { schoolId } = useAuth();
  const { data: rombel, isLoading } = useKorlasKelas();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'ringkasan';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard Korlas{rombel ? ` ${rombel.kelas}` : ''}</h1>
            <p className="text-muted-foreground">Input sumbangan komite dari siswa di rombel Anda.</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/website/komite" target="_blank"><ExternalLink className="mr-1.5 h-4 w-4" /> Lihat halaman publik</Link>
          </Button>
        </div>

        {!schoolId && <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Akun ini belum terhubung ke sekolah. Minta Super Admin memilihkan sekolah pada akun Anda.</p>}
        {!isLoading && schoolId && !rombel && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Rombel akun ini belum ditetapkan. Hubungi bendahara komite agar menetapkannya (tab Korlas).</p>
        )}

        {rombel && (
          <Tabs value={tab} onValueChange={(v) => setParams(v === 'ringkasan' ? {} : { tab: v }, { replace: true })}>
            <TabsList className="flex h-auto flex-wrap justify-start">
              <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
              <TabsTrigger value="input">Input Sumbangan</TabsTrigger>
              <TabsTrigger value="siswa">Daftar Siswa</TabsTrigger>
              <TabsTrigger value="riwayat">Riwayat</TabsTrigger>
            </TabsList>
            <TabsContent value="ringkasan" className="mt-4"><KomiteDashboardSummary korlas /></TabsContent>
            <TabsContent value="input" className="mt-4"><InputForm kelas={rombel.kelas} /></TabsContent>
            <TabsContent value="siswa" className="mt-4"><DaftarSiswa kelas={rombel.kelas} /></TabsContent>
            <TabsContent value="riwayat" className="mt-4"><Riwayat /></TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
