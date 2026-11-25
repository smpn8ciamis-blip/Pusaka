import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PAGE_SIZES = ['10', '25', '50', '100'];

/** Kontrol halaman: rentang baris, ukuran halaman, dan tombol pindah halaman. */
export function KomitePagination({
  total, page, pageSize, onPage, onPageSize,
}: { total: number; page: number; pageSize: number; onPage: (p: number) => void; onPageSize: (n: number) => void }) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pages);
  const from = (cur - 1) * pageSize;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <div className="flex items-center gap-2">
        <span className="tabular-nums">{from + 1}–{Math.min(from + pageSize, total)} dari {total}</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[110px]" aria-label="Jumlah baris per halaman"><SelectValue /></SelectTrigger>
          <SelectContent>{PAGE_SIZES.map((n) => (<SelectItem key={n} value={n}>{n} / halaman</SelectItem>))}</SelectContent>
        </Select>
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" disabled={cur <= 1} onClick={() => onPage(1)} aria-label="Halaman pertama"><ChevronsLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" disabled={cur <= 1} onClick={() => onPage(cur - 1)} aria-label="Halaman sebelumnya"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="px-2 tabular-nums">Halaman {cur} dari {pages}</span>
          <Button variant="outline" size="sm" disabled={cur >= pages} onClick={() => onPage(cur + 1)} aria-label="Halaman berikutnya"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" disabled={cur >= pages} onClick={() => onPage(pages)} aria-label="Halaman terakhir"><ChevronsRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
