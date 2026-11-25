// Elemen tampilan untuk halaman Absensi guru mapel (src/pages/Attendance.tsx).
// Hanya presentasi: tidak ada pengambilan data di sini.
import React from 'react';
import { CheckCircle2, Clock, Stethoscope, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type UiStatus = 'Hadir' | 'Terlambat' | 'Sakit' | 'Izin' | 'Alpa';
export const UI_STATUSES: UiStatus[] = ['Hadir', 'Terlambat', 'Sakit', 'Izin', 'Alpa'];

// Semua kelas ditulis utuh (literal) agar terbaca oleh Tailwind.
export const STATUS_UI: Record<
  UiStatus,
  {
    label: string;
    short: string;
    icon: typeof CheckCircle2;
    text: string;
    bg: string;
    solid: string;
    checked: string; // gaya tombol radio saat terpilih (peer-checked)
  }
> = {
  Hadir: {
    label: 'Hadir', short: 'H', icon: CheckCircle2,
    text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', solid: 'bg-emerald-500',
    checked: 'peer-checked:border-emerald-500 peer-checked:bg-emerald-500 peer-checked:text-white',
  },
  Terlambat: {
    label: 'Terlambat', short: 'T', icon: Clock,
    text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', solid: 'bg-orange-500',
    checked: 'peer-checked:border-orange-500 peer-checked:bg-orange-500 peer-checked:text-white',
  },
  Sakit: {
    label: 'Sakit', short: 'S', icon: Stethoscope,
    text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', solid: 'bg-amber-500',
    checked: 'peer-checked:border-amber-500 peer-checked:bg-amber-500 peer-checked:text-white',
  },
  Izin: {
    label: 'Izin', short: 'I', icon: Clock,
    text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10', solid: 'bg-blue-500',
    checked: 'peer-checked:border-blue-500 peer-checked:bg-blue-500 peer-checked:text-white',
  },
  Alpa: {
    label: 'Alpa', short: 'A', icon: XCircle,
    text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', solid: 'bg-red-500',
    checked: 'peer-checked:border-red-500 peer-checked:bg-red-500 peer-checked:text-white',
  },
};

/** 'hadir' (nilai di basis data) → 'Hadir' */
export const toUiStatus = (s: string): UiStatus | null => {
  const k = (s || '').charAt(0).toUpperCase() + (s || '').slice(1).toLowerCase();
  return (UI_STATUSES as string[]).includes(k) ? (k as UiStatus) : null;
};

export const initialsOf = (name: string) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** Baris panjang di luar layar tidak dirender sampai mendekati layar (abaikan bila peramban belum mendukung). */
export const lazyRowStyle = (h = 76): React.CSSProperties =>
  ({ contentVisibility: 'auto', containIntrinsicSize: `auto ${h}px` }) as React.CSSProperties;

export function StatusPill({ status }: { status: string }) {
  const k = toUiStatus(status);
  if (!k) return <span className="capitalize">{status}</span>;
  const m = STATUS_UI[k];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${m.bg} ${m.text}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {m.label}
    </span>
  );
}

export function Avatar({ name, tone = 'bg-primary/10 text-primary', size = 'h-10 w-10' }: { name: string; tone?: string; size?: string }) {
  return (
    <span aria-hidden="true" className={`grid ${size} shrink-0 place-items-center rounded-full text-xs font-semibold ${tone}`}>
      {initialsOf(name)}
    </span>
  );
}

export function StatTile({ kind, value, total, note }: { kind: UiStatus; value: number; total: number; note?: string }) {
  const m = STATUS_UI[kind];
  const Icon = m.icon;
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md md:p-4">
      <div className={`absolute inset-x-0 top-0 h-1 ${m.solid}`} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground md:text-sm">{m.label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${m.bg} ${m.text}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums md:text-3xl">{value}</span>
        <span className={`text-xs font-medium tabular-nums ${m.text}`}>{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={`h-full rounded-full ${m.solid}`} style={{ width: `${pct}%` }} />
      </div>
      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

export function RateRing({ pct, size = 88 }: { pct: number | null; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const color = pct == null ? 'stroke-muted-foreground/30' : v >= 90 ? 'stroke-emerald-500' : v >= 75 ? 'stroke-amber-500' : 'stroke-red-500';
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={pct == null ? 'Belum ada data kehadiran' : `Tingkat kehadiran ${v.toFixed(1)} persen`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={`${color} transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none`}
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-tight">
        <div>
          <div className="text-lg font-bold tabular-nums">{pct == null ? '-' : `${v.toFixed(0)}%`}</div>
          <div className="text-[10px] text-muted-foreground">hadir</div>
        </div>
      </div>
    </div>
  );
}

export function SectionCard({
  title, icon, description, action, children,
}: { title: string; icon?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden rounded-xl border shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 p-4 pb-2 md:p-6 md:pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base text-balance md:text-lg">
            {icon}
            {title}
          </CardTitle>
          {description && <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-3 pt-1 md:p-6 md:pt-2">{children}</CardContent>
    </Card>
  );
}

/**
 * Pilihan status per siswa memakai radio asli (disembunyikan secara visual): navigasi panah, grup, dan
 * pembaca layar bekerja bawaan peramban; gaya terpilih lewat varian `peer-checked`.
 */
export function StatusRadioGroup({
  name, label, value, onChange,
}: { name: string; label: string; value: string; onChange: (s: UiStatus) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {UI_STATUSES.map((s) => {
          const m = STATUS_UI[s];
          return (
            <label key={s} className="relative block cursor-pointer touch-manipulation">
              <input
                type="radio"
                name={name}
                value={s}
                checked={value === s}
                onChange={() => onChange(s)}
                className="peer sr-only"
              />
              <span
                className={`flex h-10 items-center justify-center rounded-lg border bg-background px-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background motion-reduce:transition-none ${m.checked}`}
              >
                <span className="sm:hidden" aria-hidden="true">{m.short}</span>
                <span className="hidden sm:inline">{m.label}</span>
                <span className="sr-only sm:hidden">{m.label}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
