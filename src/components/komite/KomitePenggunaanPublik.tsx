import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortHeader, type SortDir } from '@/components/komite/SortHeader';
import { KomitePagination } from '@/components/komite/KomitePagination';
import { FotoBarang } from '@/components/komite/FotoBarang';
import { KomiteBar } from '@/components/komite/KomiteBars';
import { bandingAlami, formatRupiah, formatTanggal } from '@/lib/komite';
import { cocok, formatVolume, type KomiteAnggaranPublik, type KomitePenggunaanPublik } from '@/lib/komiteAnggaran';

type SortKey = 'tanggal' | 'uraian' | 'kelompok' | 'jumlah';
const TANPA_POS = '__tanpa__';

function Kartu({ label, nilai, catatan, tone = 'text-slate-900' }: { label: string; nilai: string; catatan?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums md:text-2xl ${tone}`}>{nilai}</div>
      {catatan && <div className="mt-0.5 text-xs text-slate-500">{catatan}</div>}
    </div>
  );
}

const posLabel = (r: KomitePenggunaanPublik) => r.kelompok ?? 'Tanpa pos RAB';

/** Tab Penggunaan di halaman publik: dana terkumpul, belanja, sisa, dan daftar transaksi (cari, filter pos, urut, halaman, foto barang). */
export function KomitePenggunaanPublik({ data }: { data: KomiteAnggaranPublik }) {
  const rows = useMemo(() => data.penggunaan ?? [], [data.penggunaan]);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'tanggal', dir: 'desc' });
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const terkumpul = Number(data.terkumpul ?? 0);
  const terpakai = Number(data.total_penggunaan ?? 0);
  const sisa = terkumpul - terpakai;

  const kelompok = useMemo(() => Array.from(new Set(rows.map((r) => r.kelompok).filter(Boolean) as string[])).sort(bandingAlami), [rows]);
  const adaTanpaPos = rows.some((r) => !r.kelompok);

  const filtered = useMemo(() => {
    const needle = q.trim();
    const out = rows.filter((r) => {
      if (pos === TANPA_POS && r.kelompok) return false;
      if (pos !== 'all' && pos !== TANPA_POS && r.kelompok !== pos) return false;
      if (needle && !(cocok(r.uraian, needle) || cocok(r.penerima, needle) || cocok(r.rab_uraian, needle) || cocok(r.keterangan, needle))) return false;
      return true;
    });
    const mul = sort.dir === 'asc' ? 1 : -1;
    const cmp = (a: KomitePenggunaanPublik, b: KomitePenggunaanPublik) => {
      switch (sort.key) {
        case 'tanggal': return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0;
        case 'uraian': return bandingAlami(a.uraian, b.uraian);
        case 'kelompok': return bandingAlami(posLabel(a), posLabel(b));
        default: return Number(a.jumlah) - Number(b.jumlah);
      }
    };
    return out.map((r, i) => ({ r, i })).sort((x, y) => mul * cmp(x.r, y.r) || x.i - y.i).map((x) => x.r);
  }, [rows, q, pos, sort]);

  const jumlahTampil = useMemo(() => filtered.reduce((a, r) => a + Number(r.jumlah), 0), [filtered]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const view = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const aktif = q.trim() !== '' || pos !== 'all';
  const toggle = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'tanggal' || key === 'jumlah' ? 'desc' : 'asc' }));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kartu label="Dana terkumpul" nilai={formatRupiah(terkumpul)} />
        <Kartu label="Sudah dibelanjakan" nilai={formatRupiah(terpakai)} catatan={`${data.jumlah_penggunaan ?? rows.length} transaksi`} />
        <Kartu
          label={sisa >= 0 ? 'Sisa dana' : 'Belanja melebihi dana terkumpul'} nilai={formatRupiah(Math.abs(sisa))}
          tone={sisa >= 0 ? 'text-emerald-700' : 'text-red-600'}
        />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <KomiteBar label="Dana yang sudah dibelanjakan" value={terpakai} total={terkumpul} color="bg-emerald-600" showAmount={false} />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Belum ada penggunaan dana yang dicatat.</p>
      ) : (
        <div>
          <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari barang, toko, atau keterangan" aria-label="Cari transaksi" className="pl-9" type="search" />
            </div>
            <Select value={pos} onValueChange={(v) => { setPos(v); setPage(1); }}>
              <SelectTrigger aria-label="Filter pos RAB"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Semua pos RAB</SelectItem>
                {kelompok.map((k) => (<SelectItem key={k} value={k}>{k}</SelectItem>))}
                {adaTanpaPos && <SelectItem value={TANPA_POS}>Tanpa pos RAB</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500" aria-live="polite">
            <p>
              {aktif ? `${filtered.length} dari ${rows.length} transaksi` : `Seluruh ${rows.length} transaksi`}
              {filtered.length > 0 && <> · jumlah <span className="font-semibold tabular-nums text-slate-700">{formatRupiah(jumlahTampil)}</span></>}
            </p>
            {aktif && (
              <button type="button" onClick={() => { setQ(''); setPos('all'); setPage(1); }} className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">
                <X className="h-3.5 w-3.5" aria-hidden /> Hapus filter
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <SortHeader label="Tanggal" active={sort.key === 'tanggal'} dir={sort.dir} onClick={() => toggle('tanggal')} />
                  <SortHeader label="Barang / belanja" active={sort.key === 'uraian'} dir={sort.dir} onClick={() => toggle('uraian')} />
                  <SortHeader label="Pos RAB" active={sort.key === 'kelompok'} dir={sort.dir} onClick={() => toggle('kelompok')} />
                  <SortHeader label="Jumlah" align="right" active={sort.key === 'jumlah'} dir={sort.dir} onClick={() => toggle('jumlah')} />
                  <th scope="col" className="px-4 py-3 text-left font-semibold uppercase tracking-wider">Foto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {view.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Tidak ada transaksi yang cocok dengan filter.</td></tr>}
                {view.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatTanggal(r.tanggal)}</td>
                    <td className="px-4 py-2.5 text-slate-800">
                      <div className="font-medium">{r.uraian}</div>
                      <div className="text-xs text-slate-500">
                        {formatVolume(r.volume)}{r.satuan ? ` ${r.satuan}` : ''}{r.penerima ? ` · ${r.penerima}` : ''}
                      </div>
                      {r.keterangan && <div className="text-xs text-slate-500">{r.keterangan}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{r.kelompok ? <>{r.kelompok}{r.rab_uraian && <div className="text-xs text-slate-500">{r.rab_uraian}</div>}</> : <span className="text-slate-400">-</span>}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatRupiah(r.jumlah)}</td>
                    <td className="px-4 py-2.5"><FotoBarang path={r.foto_path} judul={r.uraian} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <KomitePagination total={filtered.length} page={cur} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        </div>
      )}
    </div>
  );
}
