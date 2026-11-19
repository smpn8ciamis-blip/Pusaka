import { GraduationCap } from 'lucide-react';
import { KomiteBar } from '@/components/komite/KomiteBars';
import { useKomitePerKelas } from '@/hooks/useKomite';
import { formatRupiah } from '@/lib/komite';

/** Pendapatan per rombel. Bendahara komite: tabel semua rombel; korlas: kartu rombelnya sendiri. */
export function KomitePerKelas({ single = false }: { single?: boolean }) {
  const { data: rows = [], isLoading, isError } = useKomitePerKelas();

  if (isLoading) return <div className="h-32 animate-pulse rounded-2xl bg-muted" />;
  if (isError) return <p className="text-sm text-destructive">Ringkasan per rombel belum dapat dimuat.</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Belum ada data rombel.</p>;

  if (single) {
    const r = rows[0];
    return (
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><GraduationCap className="h-4 w-4" aria-hidden /> Rombel {r.kelas}</div>
        <div className="mt-2 text-3xl font-bold tabular-nums">{formatRupiah(r.total)}</div>
        <div className="text-xs text-muted-foreground">{r.jumlah} catatan sumbangan</div>
        <div className="mt-4 max-w-md">
          <KomiteBar label="Siswa yang sudah menyumbang" value={r.siswa_penyumbang} total={r.siswa_total} color="bg-sky-500" height="h-2.5" showAmount={false}
            hint={`${r.siswa_penyumbang} dari ${r.siswa_total} siswa`} />
        </div>
        <dl className="mt-4 grid max-w-md grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-muted/50 p-2"><dt className="text-xs text-muted-foreground">Rekening</dt><dd className="font-semibold tabular-nums">{formatRupiah(r.rekening)}</dd></div>
          <div className="rounded-lg bg-muted/50 p-2"><dt className="text-xs text-muted-foreground">Tunai</dt><dd className="font-semibold tabular-nums">{formatRupiah(r.tunai)}</dd></div>
        </dl>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Rombel</th>
            <th className="px-4 py-3">Siswa menyumbang</th>
            <th className="px-4 py-3 text-right">Rekening</th>
            <th className="px-4 py-3 text-right">Tunai</th>
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.class_id}>
              <td className="px-4 py-2.5 font-medium">{r.kelas}</td>
              <td className="px-4 py-2.5 tabular-nums">{r.siswa_penyumbang} / {r.siswa_total}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatRupiah(r.rekening)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatRupiah(r.tunai)}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatRupiah(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/30 font-semibold">
          <tr>
            <td className="px-4 py-2.5">Jumlah</td>
            <td className="px-4 py-2.5 tabular-nums">{rows.reduce((a, r) => a + r.siswa_penyumbang, 0)} / {rows.reduce((a, r) => a + r.siswa_total, 0)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatRupiah(rows.reduce((a, r) => a + r.rekening, 0))}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatRupiah(rows.reduce((a, r) => a + r.tunai, 0))}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatRupiah(rows.reduce((a, r) => a + r.total, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
