import { formatRupiah, persen, persenTeks } from '@/lib/komite';

interface BarProps {
  label: string;
  value: number;
  total: number;           // pembagi persentase (mis. target)
  color?: string;          // kelas Tailwind warna isi
  height?: string;         // kelas tinggi
  hint?: string;
  showAmount?: boolean;
}

/** Bar progres aksesibel (role=progressbar) dengan label, nominal, dan persen. */
export function KomiteBar({ label, value, total, color = 'bg-emerald-500', height = 'h-3', hint, showAmount = true }: BarProps) {
  const p = persen(value, total);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-600 tabular-nums">
          {showAmount && <span className="font-semibold text-slate-900">{formatRupiah(value)}</span>}
          {showAmount && ' · '}
          {persenTeks(value, total)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p)}
        className={`w-full overflow-hidden rounded-full bg-slate-200/80 ${height}`}
      >
        <div className={`${height} rounded-full ${color} transition-[width] duration-700 ease-out`} style={{ width: `${p}%` }} />
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Bar utama penggalangan dana: terkumpul vs target. */
export function KomiteMainProgress({ total, target, className = '' }: { total: number; target: number; className?: string }) {
  const p = persen(total, target);
  const lewat = target > 0 && total >= target;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Terkumpul</div>
          <div className="text-3xl font-bold text-slate-900 tabular-nums md:text-4xl">{formatRupiah(total)}</div>
        </div>
        <div className="sm:text-right">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Target</div>
          <div className="text-lg font-semibold text-slate-700 tabular-nums md:text-xl">{target > 0 ? formatRupiah(target) : 'Belum ditetapkan'}</div>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Progres penggalangan dana"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p)}
        className="mt-4 h-6 w-full overflow-hidden rounded-full bg-slate-200/80"
      >
        <div
          className={`flex h-6 items-center justify-end rounded-full pr-2 text-[11px] font-bold text-white transition-[width] duration-700 ease-out ${lewat ? 'bg-emerald-600' : 'bg-gradient-to-r from-[#1E40AF] to-[#3B82F6]'}`}
          style={{ width: `${Math.max(p, p > 0 ? 6 : 0)}%` }}
        >
          {p >= 12 ? persenTeks(total, target) : ''}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-slate-600">
        <span>{target > 0 ? `${persenTeks(total, target)} dari target` : 'Target belum ditetapkan'}</span>
        <span>
          {target > 0 && (lewat ? 'Target tercapai 🎉' : `Kurang ${formatRupiah(target - total)}`)}
        </span>
      </div>
    </div>
  );
}
