import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Plus, Trash2 } from 'lucide-react';
import {
  EXAM_SUBJECT_SUGGESTIONS, emptySession, renumber, toDateInput, sessionDate, withDate, withTimes, type ExamSession,
} from '@/lib/examSchedule';

interface Props {
  value: ExamSession[];
  onChange: (next: ExamSession[]) => void;
}

/** Editor jadwal ujian: tambah, ubah, gandakan, hapus sesi. Dalam 1 hari boleh ada beberapa sesi. */
export function ExamScheduleEditor({ value, onChange }: Props) {
  const update = (i: number, s: ExamSession) => onChange(value.map((x, idx) => (idx === i ? s : x)));
  const remove = (i: number) => onChange(renumber(value.filter((_, idx) => idx !== i)));
  const duplicate = (i: number) => onChange(renumber([...value.slice(0, i + 1), { ...value[i] }, ...value.slice(i + 1)]));

  return (
    <div className="space-y-3">
      <datalist id="exam-subject-list">
        {EXAM_SUBJECT_SUGGESTIONS.map((m) => <option key={m} value={m} />)}
      </datalist>

      {value.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Belum ada sesi ujian. Tekan &ldquo;Tambah Sesi&rdquo; untuk mulai menyusun jadwal.
        </p>
      )}

      {value.map((s, i) => (
        <Card key={i} className="p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">
              Sesi {i + 1}
              {s.day && s.date && <span className="ml-2 font-normal text-muted-foreground">{s.day}, {s.date}</span>}
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => duplicate(i)} title="Gandakan sesi"><Copy className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} title="Hapus sesi" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`d-${i}`}>Tanggal</Label>
              <Input id={`d-${i}`} type="date" value={toDateInput(sessionDate(s))} onChange={(e) => update(i, withDate(s, e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`m-${i}`}>Mata pelajaran</Label>
              <Input id={`m-${i}`} list="exam-subject-list" value={s.subject} placeholder="Pilih atau ketik mata pelajaran"
                onChange={(e) => update(i, { ...s, subject: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`a-${i}`}>Jam mulai</Label>
              <Input id={`a-${i}`} type="time" value={s.startTime || ''} onChange={(e) => update(i, withTimes(s, e.target.value, s.endTime || ''))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`b-${i}`}>Jam selesai</Label>
              <Input id={`b-${i}`} type="time" value={s.endTime || ''} onChange={(e) => update(i, withTimes(s, s.startTime || '', e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Durasi</Label>
              <Input value={s.duration ? `${s.duration} menit` : ''} placeholder="Otomatis" disabled className="bg-muted" />
            </div>
          </div>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={() => onChange([...value, emptySession(value.length + 1)])}>
        <Plus className="mr-1.5 h-4 w-4" /> Tambah Sesi
      </Button>
    </div>
  );
}
