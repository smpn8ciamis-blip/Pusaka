import { useEffect, useState, type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Kunci cache TanStack Query untuk jumlah pesan belum dibaca (dipakai layout & halaman Pesan). */
export const UNREAD_KEY = ["web-admin", "unread"] as const;

/** Kartu putih bergaris tipis — dipakai seragam di seluruh panel web-admin. */
export const cardCls = "rounded-2xl border border-slate-200/70 bg-white shadow-sm";

/** Judul halaman + tombol aksi (di HP aksi turun ke bawah judul). */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/15",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/15",
  red: "bg-red-50 text-red-700 ring-red-600/15",
} as const;

/** Lencana status kecil. */
export function Pill({ tone = "slate", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Ya/Tidak (atau Aktif/Nonaktif) sebagai lencana. */
export const YesNo = ({ value, yes = "Ya", no = "Tidak" }: { value: unknown; yes?: string; no?: string }) =>
  value ? <Pill tone="green">{yes}</Pill> : <Pill tone="slate">{no}</Pill>;

export function EmptyState({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className={`${cardCls} flex flex-col items-center px-4 py-14 text-center text-sm text-slate-400`}>
      <div className="mb-2 text-slate-300">{icon ?? <Inbox className="h-9 w-9" />}</div>
      {children}
    </div>
  );
}

/** Kerangka pemuatan daftar: lebih ringan dan tidak melompat dibanding spinner. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Memuat">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${cardCls} flex items-center gap-3 p-4`}>
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : "—";

export const fmtDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
    : "—";

/** true bila layar sempit (<768px). Nilai awal dibaca langsung, jadi tidak ada kedipan tabel -> kartu di HP. */
export function useIsNarrow() {
  const query = "(max-width: 767px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}
