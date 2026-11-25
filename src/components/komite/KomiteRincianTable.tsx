import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortHeader, type SortDir } from '@/components/komite/SortHeader';
import { SUMBER_LABEL, KATEGORI_LABEL, bandingAlami, formatRupiah, formatTanggal, namaRombel, type KomiteRincianPublik } from '@/lib/komite';

type SortKey = 'tanggal' | 'nama' | 'asal' | 'sumber' | 'jumlah';

const PAGE_SIZES = ['20', '50', '100'];

const asalLabel = (r: KomiteRincianPublik) =>
  r.kategori === 'siswa' ? (namaRombel(r.kelas) ? `Kelas ${namaRombel(r.kelas)}` : `Kelas ${r.grade}`) : KATEGORI_LABEL.donatur_lain;

/** Rincian catatan sumbangan: semua catatan, dengan pencarian, filter, urutan, dan halaman. */
export function KomiteRincianTable({ rows, namaMode }: { rows: KomiteRincianPublik[]; namaMode?: string }) {
  const [asal, setAsal] = useState('all'); // all | g7 | g8 | g9 | lain | k:<nama rombel lengkap>
  const [sumber, setSumber] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'tanggal', dir: 'desc' });
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const rombelList = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.kategori === 'siswa' && r.kelas) set.add(r.kelas); });
    return Array.from(set).sort(bandingAlami);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (asal === 'lain' && r.kategori !== 'donatur_lain') return false;
      if (asal.startsWith('g') && !(r.kategori === 'siswa' && `g${r.grade}` === asal)) return false;
      if (asal.startsWith('k:') && !(r.kategori === 'siswa' && r.kelas === asal.slice(2))) return false;
      if (sumber !== 'all' && r.sumber !== sumber) return false;
      if (needle && !String(r.nama).toLowerCase().includes(needle)) return false;
      return true;
    });
    const mul = sort.dir === 'asc' ? 1 : -1;
    const cmp = (a: KomiteRincianPublik, b: KomiteRincianPublik) => {
      switch (sort.key) {
        case 'tanggal': return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0;
        case 'nama': return bandingAlami(a.nama, b.nama);
        case 'asal': return bandingAlami(asalLabel(a), asalLabel(b));
        case 'sumber': return bandingAlami(a.sumber, b.sumber);
        default: return Number(a.jumlah) - Number(b.jumlah);
      }
    };
    // Urutan asli (terbaru dulu) dipertahankan untuk nilai yang sama.
    return out.map((r, i) => ({ r, i })).sort((x, y) => mul * cmp(x.r, y.r) || x.i - y.i).map((x) => x.r);
  }, [rows, asal, sumber, q, sort]);

  const jumlahTampil = useMemo(() => filtered.reduce((a, r) => a + Number(r.jumlah || 0), 0), [filtered]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const from = (cur - 1) * pageSize;
  const view = filtered.slice(from, from + pageSize);
  const aktif = asal !== 'all' || sumber !== 'all' || q.trim() !== '';

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'tanggal' || key === 'jumlah' ? 'desc' : 'asc' }));
    setPage(1);
  };
  const reset = () => { setAsal('all'); setSumber('all'); setQ(''); setPage(1); };

  return (
    <div>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_160px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Cari nama penyumbang" aria-label="Cari nama penyumbang" className="pl-9" type="search"
          />
        </div>
        <Select value={asal} onValueChange={(v) => { setAsal(v); setPage(1); }}>
          <SelectTrigger aria-label="Filter asal"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Semua asal</SelectItem>
            <SelectItem value="g7">Siswa kelas 7</SelectItem>
            <SelectItem value="g8">Siswa kelas 8</SelectItem>
            <SelectItem value="g9">Siswa kelas 9</SelectItem>
            <SelectItem value="lain">Donatur lainnya</SelectItem>
            {rombelList.map((k) => (<SelectItem key={k} value={`k:${k}`}>Rombel {namaRombel(k) || k}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={sumber} onValueChange={(v) => { setSumber(v); setPage(1); }}>
          <SelectTrigger aria-label="Filter sumber"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua sumber</SelectItem>
            <SelectItem value="rekening">Rekening</SelectItem>
            <SelectItem value="tunai">Tunai</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500" aria-live="polite">
        <p>
          {namaMode === 'lengkap' ? '' : 'Nama disamarkan untuk menjaga privasi. '}
          {aktif ? `${filtered.length} dari ${rows.length} catatan` : `Seluruh ${rows.length} catatan`}
          {filtered.length > 0 && <> · jumlah <span className="font-semibold tabular-nums text-slate-700">{formatRupiah(jumlahTampil)}</span></>}
        </p>
        {aktif && (
          <button type="button" onClick={reset} className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">
            <X className="h-3.5 w-3.5" aria-hidden /> Hapus filter
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <SortHeader label="Tanggal" active={sort.key === 'tanggal'} dir={sort.dir} onClick={() => toggleSort('tanggal')} />
              <SortHeader label="Penyumbang" active={sort.key === 'nama'} dir={sort.dir} onClick={() => toggleSort('nama')} />
              <SortHeader label="Asal" active={sort.key === 'asal'} dir={sort.dir} onClick={() => toggleSort('asal')} />
              <SortHeader label="Sumber" active={sort.key === 'sumber'} dir={sort.dir} onClick={() => toggleSort('sumber')} />
              <SortHeader label="Jumlah" align="right" active={sort.key === 'jumlah'} dir={sort.dir} onClick={() => toggleSort('jumlah')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{aktif ? 'Tidak ada catatan yang cocok dengan filter.' : 'Belum ada catatan.'}</td></tr>
            )}
            {view.map((r, i) => (
              <tr key={`${from + i}-${r.tanggal}-${r.nama}`} className="hover:bg-slate-50/60">
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatTanggal(r.tanggal)}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.nama}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{asalLabel(r)}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.sumber === 'rekening' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {SUMBER_LABEL[r.sumber]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatRupiah(r.jumlah)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{from + 1}–{Math.min(from + pageSize, filtered.length)} dari {filtered.length}</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-[110px]" aria-label="Jumlah baris per halaman"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((n) => (<SelectItem key={n} value={n}>{n} / halaman</SelectItem>))}</SelectContent>
            </Select>
          </div>
          {pages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={cur <= 1} onClick={() => setPage(1)} aria-label="Halaman pertama"><ChevronsLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label="Halaman sebelumnya"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="px-2 tabular-nums">Halaman {cur} dari {pages}</span>
              <Button variant="outline" size="sm" disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label="Halaman berikutnya"><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" disabled={cur >= pages} onClick={() => setPage(pages)} aria-label="Halaman terakhir"><ChevronsRight className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
