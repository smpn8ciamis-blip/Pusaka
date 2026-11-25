import { Fragment, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { KomiteBar } from '@/components/komite/KomiteBars';
import { bandingAlami, formatRupiah } from '@/lib/komite';
import { cocok, formatVolume, type KomiteAnggaranPublik } from '@/lib/komiteAnggaran';

function Kartu({ label, nilai, catatan, tone = 'text-slate-900' }: { label: string; nilai: string; catatan?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums md:text-2xl ${tone}`}>{nilai}</div>
      {catatan && <div className="mt-0.5 text-xs text-slate-500">{catatan}</div>}
    </div>
  );
}

/** Tab RAB di halaman publik: ringkasan, dibandingkan dengan dana terkumpul dan realisasi belanja, lalu daftar per kelompok. */
export function KomiteRabPublik({ data }: { data: KomiteAnggaranPublik }) {
  const rows = data.rab ?? [];
  const [q, setQ] = useState('');
  const adaRealisasi = !!data.tampilkan_penggunaan;
  const totalRab = Number(data.total_rab ?? 0);
  const terkumpul = Number(data.terkumpul ?? 0);
  const terpakai = Number(data.total_penggunaan ?? 0);
  const selisih = terkumpul - totalRab;

  const groups = useMemo(() => {
    const needle = q.trim();
    const map = new Map<string, typeof rows>();
    rows.forEach((r) => {
      if (needle && !(cocok(r.uraian, needle) || cocok(r.kelompok, needle) || cocok(r.keterangan, needle))) return;
      const arr = map.get(r.kelompok) ?? [];
      arr.push(r);
      map.set(r.kelompok, arr);
    });
    return Array.from(map.entries()).sort((a, b) => bandingAlami(a[0], b[0]));
  }, [rows, q]);

  if (rows.length === 0) {
    return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">RAB belum dipublikasikan.</p>;
  }
  const kolom = adaRealisasi ? 7 : 5;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kartu label="Total RAB" nilai={formatRupiah(totalRab)} catatan={`${rows.length} butir anggaran`} />
        <Kartu label="Dana terkumpul" nilai={formatRupiah(terkumpul)} />
        <Kartu
          label={selisih >= 0 ? 'Dana melebihi RAB' : 'Dana kurang dari RAB'} nilai={formatRupiah(Math.abs(selisih))}
          tone={selisih >= 0 ? 'text-emerald-700' : 'text-amber-700'}
        />
        {adaRealisasi && <Kartu label="Sudah dibelanjakan" nilai={formatRupiah(terpakai)} catatan={totalRab > 0 ? `${Math.round((terpakai / totalRab) * 100)}% dari RAB` : undefined} />}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <KomiteBar label="Dana terkumpul terhadap RAB" value={terkumpul} total={totalRab} color="bg-blue-600" showAmount={false} />
          {adaRealisasi && <KomiteBar label="Realisasi belanja terhadap RAB" value={terpakai} total={totalRab} color="bg-emerald-600" showAmount={false} />}
        </div>
      </div>

      <div>
        <div className="relative mb-3 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari uraian atau kelompok" aria-label="Cari dalam RAB" className="pl-9" type="search" />
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-semibold">Uraian</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Volume</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Harga satuan</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Jumlah</th>
                {adaRealisasi && <th scope="col" className="px-4 py-3 text-right font-semibold">Terpakai</th>}
                {adaRealisasi && <th scope="col" className="px-4 py-3 text-right font-semibold">Sisa</th>}
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && <tr><td colSpan={kolom - 1} className="px-4 py-10 text-center text-slate-500">Tidak ada butir yang cocok.</td></tr>}
              {groups.map(([kelompok, items]) => {
                const sub = items.reduce((a, r) => a + Number(r.jumlah), 0);
                const subPakai = items.reduce((a, r) => a + Number(r.terpakai ?? 0), 0);
                return (
                  <Fragment key={kelompok}>
                    <tr className="bg-slate-100/70">
                      <th scope="rowgroup" colSpan={3} className="px-4 py-2 text-left font-bold text-slate-800">{kelompok}</th>
                      <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-800">{formatRupiah(sub)}</td>
                      {adaRealisasi && <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-700">{formatRupiah(subPakai)}</td>}
                      {adaRealisasi && <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-700">{formatRupiah(sub - subPakai)}</td>}
                    </tr>
                    {items.map((r) => {
                      const pakai = Number(r.terpakai ?? 0);
                      const lebih = adaRealisasi && pakai > Number(r.jumlah);
                      return (
                        <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 text-slate-800">
                            {r.uraian}
                            {r.keterangan && <div className="text-xs text-slate-500">{r.keterangan}</div>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-600">{formatVolume(r.volume)}{r.satuan ? ` ${r.satuan}` : ''}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-600">{formatRupiah(r.harga_satuan)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatRupiah(r.jumlah)}</td>
                          {adaRealisasi && <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700">{formatRupiah(pakai)}</td>}
                          {adaRealisasi && (
                            <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums ${lebih ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                              {lebih ? `Lebih ${formatRupiah(pakai - Number(r.jumlah))}` : formatRupiah(Number(r.jumlah) - pakai)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
            {groups.length > 0 && (
              <tfoot className="bg-slate-50 font-bold text-slate-900">
                <tr>
                  <td colSpan={3} className="px-4 py-3">{q.trim() ? 'Jumlah (hasil pencarian)' : 'Total RAB'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatRupiah(groups.reduce((a, [, items]) => a + items.reduce((b, r) => b + Number(r.jumlah), 0), 0))}
                  </td>
                  {adaRealisasi && <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatRupiah(groups.reduce((a, [, items]) => a + items.reduce((b, r) => b + Number(r.terpakai ?? 0), 0), 0))}</td>}
                  {adaRealisasi && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">RAB adalah rencana anggaran dan dapat berubah. Dana terkumpul dibandingkan dengan RAB hanya sebagai gambaran kecukupan dana.</p>
      </div>
    </div>
  );
}
