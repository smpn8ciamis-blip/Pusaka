import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';

/** Judul kolom yang bisa diurutkan (tombol di dalam <th>, aria-sort untuk pembaca layar). */
export function SortHeader({
  label, active, dir, onClick, align = 'left', className = '',
}: { label: string; active: boolean; dir: SortDir; onClick: () => void; align?: 'left' | 'right'; className?: string }) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-slate-900' : ''}`}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? '' : 'opacity-40'}`} aria-hidden />
      </button>
    </th>
  );
}
