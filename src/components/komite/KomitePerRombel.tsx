import { useMemo, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { SortHeader, type SortDir } from '@/components/komite/SortHeader';
import { bandingAlami, formatRupiah, namaRombel, persen, persenTeks, type KomitePerRombelPublik } from '@/lib/komite';

type SortKey = 'kelas' | 'siswa' | 'jumlah' | 'rekening' | 'tunai' | 'total';

const TINGKAT = [
  { v: 'all', label: 'Semua' },
  { v: '7', label: 'Kelas 7' },
  { v: '8', label: 'Kelas 8' },
  { v: '9', label: 'Kelas 9' },
];

const BAR: Record<number, string> = { 7: 'bg-sky-500', 8: 'bg-violet-500', 9: 'bg-amber-500' };

/** Ringkasan pendapatan per rombel di halaman publik: filter tingkat dan urutan kolom. */
export function KomitePerRombel({ rows }: { rows: KomitePerRombelPublik[] }) {
  const [tingkat, setTingkat] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'kelas', dir: 'asc' });

  const view = useMemo(() => {
    const list = rows.filter((r) => tingkat === 'all' || String(r.grade) === tingkat);
    const mul = sort.dir === 'asc' ? 1 : -1;
    const val = (r: KomitePerRombelPublik): number | string => {
      switch (sort.key) {
        case 'siswa': return persen(r.siswa_penyumbang, r.siswa_total);
        case 'jumlah': return Number(r.jumlah);
        case 'rekening': return Number(r.rekening);
        case 'tunai': return Number(r.tunai);
        case 'total': return Number(r.total);
        default: return r.kelas;
      }
    };
    return list.map((r, i) => ({ r, i })).sort((x, y) => {
      const a = val(x.r), b = val(y.r);
      const c = typeof a === 'number' && typeof b === 'number' ? a - b : bandingAlami(String(a), String(b));
      if (c) return mul * c;
      // sama: urut tingkat lalu nama agar hasil stabil dan mudah dibaca
      return x.r.grade - y.r.grade || bandingAlami(x.r.kelas, y.r.kelas) || x.i - y.i;
    }).map((x) => x.r);
  }, [rows, tingkat, sort]);

  const sum = useMemo(() => view.reduce((a, r) => ({
    siswa_total: a.siswa_total + Number(r.siswa_total), siswa_penyumbang: a.siswa_penyumbang + Number(r.siswa_penyumbang),
    jumlah: a.jumlah + Number(r.jumlah), rekening: a.rekening + Number(r.rekening), tunai: a.tunai + Number(r.tunai), total: a.total + Number(r.total),
  }), { siswa_total: 0, siswa_penyumbang: 0, jumlah: 0, rekening: 0, tunai: 0, total: 0 }), [view]);

  if (rows.length === 0) return null;
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'kelas' ? 'asc' : 'desc' }));

  return (
    <section aria-labelledby="judul-per-rombel" className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 id="judul-per-rombel" className="flex items-center gap-2 text-base font-bold text-slate-900">
          <GraduationCap className="h-4 w-4 text-[#1E40AF]" aria-hidden /> Ringkasan per Rombel
        </h3>
        <div role="group" aria-label="Filter tingkat" className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          {TINGKAT.map((t) => (
            <button
              key={t.v} type="button" aria-pressed={tingkat === t.v} onClick={() => setTingkat(t.v)}
              className={`px-3 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 ${tingkat === t.v ? 'bg-[#1E40AF] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <SortHeader label="Rombel" active={sort.key === 'kelas'} dir={sort.dir} onClick={() => toggle('kelas')} />
              <SortHeader label="Siswa menyumbang" active={sort.key === 'siswa'} dir={sort.dir} onClick={() => toggle('siswa')} className="min-w-[200px]" />
              <SortHeader label="Catatan" align="right" active={sort.key === 'jumlah'} dir={sort.dir} onClick={() => toggle('jumlah')} />
              <SortHeader label="Rekening" align="right" active={sort.key === 'rekening'} dir={sort.dir} onClick={() => toggle('rekening')} />
              <SortHeader label="Tunai" align="right" active={sort.key === 'tunai'} dir={sort.dir} onClick={() => toggle('tunai')} />
              <SortHeader label="Total" align="right" active={sort.key === 'total'} dir={sort.dir} onClick={() => toggle('total')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.map((r) => {
              const p = persen(r.siswa_penyumbang, r.siswa_total);
              return (
                <tr key={r.kelas} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{namaRombel(r.kelas) || r.kelas}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div
                        role="progressbar" aria-label={`Siswa menyumbang ${namaRombel(r.kelas) || r.kelas}`}
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)}
                        className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-200/80"
                      >
                        <div className={`h-2 rounded-full ${BAR[r.grade] ?? 'bg-emerald-500'}`} style={{ width: `${p}%` }} />
                      </div>
                      <span className="whitespace-nowrap text-xs tabular-nums text-slate-600">{r.siswa_penyumbang}/{r.siswa_total} · {persenTeks(r.siswa_penyumbang, r.siswa_total)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{r.jumlah}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700">{formatRupiah(r.rekening)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700">{formatRupiah(r.tunai)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatRupiah(r.total)}</td>
                </tr>
              );
            })}
            {view.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Belum ada rombel pada tingkat ini.</td></tr>}
          </tbody>
          {view.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-2.5">Jumlah ({view.length} rombel)</td>
                <td className="px-4 py-2.5 text-xs tabular-nums">{sum.siswa_penyumbang}/{sum.siswa_total} · {persenTeks(sum.siswa_penyumbang, sum.siswa_total)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{sum.jumlah}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatRupiah(sum.rekening)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatRupiah(sum.tunai)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatRupiah(sum.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Hanya sumbangan siswa yang tercatat atas nama rombel. Donatur lainnya tidak termasuk dalam tabel ini.</p>
    </section>
  );
}
