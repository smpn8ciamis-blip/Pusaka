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

const norm = (v: string) => v.toLowerCase().replace(/[_/\-–]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Skor kecocokan; 0 = tidak cocok. Setiap kata yang diketik harus cocok di AWAL
 * nama kelas, kata mapel, nama hari, atau jam (bukan sembarang huruf di tengah),
 * sehingga mengetik "9a" langsung menampilkan kelas 9A saja.
 */
function scoreSchedule(s: ScheduleOption, query: string): number {
  const tokens = norm(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return 1;
  const className = norm(s.classes?.name ?? '');
  const classShort = className.split(' ')[0] || '';
  const subjectWords = norm(s.subject).split(' ');
  const day = (DAYS[s.day_of_week] ?? '').toLowerCase();
  const times = [hhmm(s.start_time), hhmm(s.end_time)];
  let total = 0;
  for (const t of tokens) {
    let sc = 0;
    if (classShort === t) sc = 100;
    else if (classShort.startsWith(t)) sc = 80;
    else if (className.startsWith(t)) sc = 70;
    else if (subjectWords.some((w) => w.startsWith(t))) sc = 40;
    else if (day.startsWith(t)) sc = 30;
    else if (times.some((x) => x.startsWith(t) || x.replace(':', '').startsWith(t))) sc = 20;
    if (sc === 0) return 0;
    total += sc;
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
  const [query, setQuery] = useState('');

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

  const results = useMemo(() => {
    if (!query.trim()) return sorted;
    return sorted
      .map((s) => ({ s, sc: scoreSchedule(s, query) }))
      .filter((x) => x.sc > 0)
      .sort((a, b) => b.sc - a.sc) // sort stabil: urutan kelas/mapel tetap untuk skor sama
      .map((x) => x.s);
  }, [sorted, query]);

  const selected = schedules.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
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
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Ketik kelas (mis. 9a), mapel, hari, atau jam…"
            value={query}
            onValueChange={setQuery}
            autoCapitalize="off"
            autoCorrect="off"
          />
          {/* stopPropagation: agar scroll roda mouse tetap jalan di dalam dialog modal */}
          <CommandList className="max-h-[280px]" onWheel={(e) => e.stopPropagation()}>
            <CommandEmpty>Jadwal tidak ditemukan.</CommandEmpty>
            {results.map((s) => (
              <CommandItem
                key={s.id}
                value={s.id}
                onSelect={() => {
                  onChange(s.id);
                  setOpen(false);
                  setQuery('');
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
