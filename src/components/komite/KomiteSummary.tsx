import { HandHeart, GraduationCap } from 'lucide-react';
import { KomiteBar } from '@/components/komite/KomiteBars';
import { formatRupiah, persen, persenTeks, type KomitePublik } from '@/lib/komite';

const GRADE_COLOR: Record<number, string> = { 7: 'bg-sky-500', 8: 'bg-violet-500', 9: 'bg-amber-500' };

/** Ringkasan pendapatan per tingkat kelas (7/8/9) dan donatur lainnya. Dipakai di halaman publik & dashboard. */
export function KomiteSummary({ data, onlyGrade }: { data: KomitePublik; onlyGrade?: number | null }) {
  const total = Number(data.total ?? 0);
  const grades = (data.per_tingkat ?? []).filter((g) => !onlyGrade || g.grade === onlyGrade);
  const lain = data.donatur_lain;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {grades.map((g) => (
        <div key={g.grade} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <GraduationCap className="h-4 w-4 text-[#1E40AF]" aria-hidden />
            Kelas {g.grade}
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{formatRupiah(g.total)}</div>
          <div className="text-xs text-slate-500">{persenTeks(g.total, total)} dari seluruh pendapatan</div>
          <div className="mt-4 space-y-3">
            <KomiteBar
              label="Siswa yang sudah menyumbang"
              value={g.siswa_penyumbang}
              total={g.siswa_total}
              color={GRADE_COLOR[g.grade] ?? 'bg-emerald-500'}
              height="h-2.5"
              showAmount={false}
              hint={`${g.siswa_penyumbang} dari ${g.siswa_total} siswa · ${g.jumlah} catatan`}
            />
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <dt className="text-slate-500">Rekening</dt>
                <dd className="font-semibold text-slate-800 tabular-nums">{formatRupiah(g.rekening)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <dt className="text-slate-500">Tunai</dt>
                <dd className="font-semibold text-slate-800 tabular-nums">{formatRupiah(g.tunai)}</dd>
              </div>
            </dl>
          </div>
        </div>
      ))}

      {!onlyGrade && lain && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <HandHeart className="h-4 w-4 text-rose-600" aria-hidden />
            Donatur lainnya
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{formatRupiah(lain.total)}</div>
          <div className="text-xs text-slate-500">{persenTeks(lain.total, total)} dari seluruh pendapatan</div>
          <div className="mt-4 space-y-3">
            <div
              role="progressbar"
              aria-label="Porsi donatur lainnya"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(persen(lain.total, total))}
              className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80"
            >
              <div className="h-2.5 rounded-full bg-rose-500" style={{ width: `${persen(lain.total, total)}%` }} />
            </div>
            <p className="text-xs text-slate-500">{lain.jumlah} catatan donatur</p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-2">
                <dt className="text-slate-500">Rekening</dt>
                <dd className="font-semibold text-slate-800 tabular-nums">{formatRupiah(lain.rekening)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <dt className="text-slate-500">Tunai</dt>
                <dd className="font-semibold text-slate-800 tabular-nums">{formatRupiah(lain.tunai)}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
