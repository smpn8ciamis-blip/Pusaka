// Elemen tampilan bersama untuk tab-tab dalam Dashboard Siswa (Profil, Nilai, Kehadiran, dst.).
// Hanya presentasi, bahasa visualnya mengikuti Beranda: biru tinta + kartu bulat + palet slate.
import React from 'react';

export type Tone = 'blue' | 'emerald' | 'amber' | 'red' | 'orange' | 'violet' | 'slate';

// Kelas ditulis utuh (literal) agar terbaca Tailwind; semua mendukung mode gelap.
export const TONE: Record<Tone, { tile: string; text: string; chip: string; bar: string }> = {
  blue: { tile: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', text: 'text-blue-600 dark:text-blue-400', chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', bar: 'bg-blue-500' },
  emerald: { tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', text: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500' },
  amber: { tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' },
  red: { tile: 'bg-red-500/10 text-red-600 dark:text-red-400', text: 'text-red-600 dark:text-red-400', chip: 'bg-red-500/10 text-red-700 dark:text-red-300', bar: 'bg-red-500' },
  orange: { tile: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', text: 'text-orange-600 dark:text-orange-400', chip: 'bg-orange-500/10 text-orange-700 dark:text-orange-300', bar: 'bg-orange-500' },
  violet: { tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', text: 'text-violet-600 dark:text-violet-400', chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', bar: 'bg-violet-500' },
  slate: { tile: 'bg-slate-500/10 text-slate-600 dark:text-slate-300', text: 'text-slate-600 dark:text-slate-300', chip: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', bar: 'bg-slate-500' },
};

/** Baris panjang di luar layar tidak dirender sampai mendekati layar (diabaikan bila peramban belum mendukung). */
export const lazyRow = (h = 76): React.CSSProperties =>
  ({ contentVisibility: 'auto', containIntrinsicSize: `auto ${h}px` }) as React.CSSProperties;

export function TabHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-tight text-balance text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Chip({ tone = 'slate', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${TONE[tone].chip}`}>
      {children}
    </span>
  );
}

export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </section>
  );
}

/** Satu entri daftar: ikon bernada, judul, keterangan, dan bagian kanan (lencana/nilai). */
export function ListRow({
  icon: Icon, tone = 'blue', title, meta, trailing, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li style={lazyRow(80)} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${TONE[tone].tile}`} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">{title}</p>
        {meta && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{meta}</p>}
        {children}
      </div>
      {trailing}
    </li>
  );
}

export function StatBox({ label, value, tone = 'blue' }: { label: string; value: React.ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className={`text-2xl font-bold tabular-nums ${TONE[tone].text}`}>{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

/** Cincin persentase untuk dipakai di atas latar biru (stroke putih). */
export function HeroRing({ value, size = 84, caption }: { value: number | null; size?: number; caption?: string }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={value == null ? 'Belum ada data' : `${v.toFixed(0)} persen`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/25" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className="stroke-white transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-tight">
        <div>
          <div className="text-lg font-bold tabular-nums">{value == null ? '-' : `${v.toFixed(0)}%`}</div>
          {caption && <div className="text-[10px] text-white/80">{caption}</div>}
        </div>
      </div>
    </div>
  );
}

/** Kelompok info (definisi): ikon + label di kiri, nilai di kanan. */
export function InfoGroup({
  title, items,
}: {
  title: string;
  items: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; tone?: Tone }[];
}) {
  return (
    <Panel>
      <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((it) => (
          <div key={it.label} className="flex items-start gap-3 py-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE[it.tone || 'blue'].tile}`} aria-hidden="true">
              <it.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <dt className="text-xs text-slate-500 dark:text-slate-400">{it.label}</dt>
              <dd className="break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{it.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
