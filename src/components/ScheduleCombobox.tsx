import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface ScheduleOption {
  id: string;
  subject: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  classes?: { name: string } | null;
}

const DAYS = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const hhmm = (t: string) => (t ? t.slice(0, 5) : '');

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Pencocokan awalan (bukan fuzzy): setiap kata yang diketik harus menjadi
 * awalan dari kode kelas ("8a" cocok 8A_2026/2027, bukan 8B), nama kelas,
 * atau kata lain (mapel, hari, jam). Cocok di kelas diberi skor lebih tinggi
 * agar urutan hasil akurat. Mengembalikan 0 bila tidak cocok.
 */
export function scheduleMatchScore(value: string, search: string): number {
  const q = norm(search);
  if (!q) return 1;
  const [className = '', rest = ''] = value.split('|');
  const cls = norm(className);
  const short = cls.split('_')[0];
  const words = norm(rest).split(/[\s:–-]+/).filter(Boolean);
  const classWords = cls.split(/[\s_/-]+/).filter(Boolean);
  let total = 0;
  for (const token of q.split(' ')) {
    if (short.startsWith(token) || cls.startsWith(token)) total += 100 - Math.min(short.length, 50);
    else if (classWords.some((w) => w.startsWith(token))) total += 50;
    else if (words.some((w) => w.startsWith(token))) total += 10;
    else return 0;
  }
  return total;
}

interface Props {
  schedules: ScheduleOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}

/** Pilih jadwal dengan pencarian: ketik kelas, mapel, hari, atau jam. */
export function ScheduleCombobox({ schedules, value, onChange, placeholder = 'Pilih jadwal pelajaran', className }: Props) {
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...schedules].sort(
        (a, b) =>
          (a.classes?.name ?? '').localeCompare(b.classes?.name ?? '', undefined, { numeric: true }) ||
          a.subject.localeCompare(b.subject) ||
          a.day_of_week - b.day_of_week ||
          a.start_time.localeCompare(b.start_time),
      ),
    [schedules],
  );

  const selected = schedules.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('h-11 w-full justify-between border-2 px-3 text-left text-sm font-normal', className)}
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? (
              <>
                <span className="font-medium">{selected.classes?.name} - {selected.subject}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {DAYS[selected.day_of_week]} {hhmm(selected.start_time)}–{hhmm(selected.end_time)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        <Command filter={scheduleMatchScore}>
          <CommandInput placeholder="Ketik kelas (mis. 8a), mapel, hari, atau jam…" />
          {/* stopPropagation: agar scroll roda mouse tetap jalan di dalam dialog modal */}
          <CommandList className="max-h-[280px]" onWheel={(e) => e.stopPropagation()}>
            <CommandEmpty>Jadwal tidak ditemukan.</CommandEmpty>
            {sorted.map((s) => (
              <CommandItem
                key={s.id}
                value={`${s.classes?.name ?? ''}|${s.subject} ${DAYS[s.day_of_week] ?? ''} ${hhmm(s.start_time)} ${hhmm(s.end_time)}|${s.id}`}
                onSelect={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className="py-2"
              >
                <Check className={cn('mr-2 h-4 w-4 shrink-0', value === s.id ? 'opacity-100' : 'opacity-0')} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{s.classes?.name} - {s.subject}</span>
                  <span className="text-xs text-muted-foreground">
                    {DAYS[s.day_of_week]} • {hhmm(s.start_time)} – {hhmm(s.end_time)}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
