import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  addDaysIso, fmtDateLong, HABITS, hhmm, kaihErrorMessage, KAIH_EDIT_WINDOW_DAYS, todayWib,
  type HabitKey, type KaihEntry,
} from '@/lib/kaih';

const db = supabase as any; // tabel kaih_journals belum ada di types.ts hasil generate

interface FormState {
  date: string;
  done: Record<HabitKey, boolean>;
  wakeTime: string;
  sleepTime: string;
  worshipNote: string;
  exerciseNote: string;
  exerciseMin: string;
  mealNote: string;
  studyNote: string;
  studyMin: string;
  socialNote: string;
  notes: string;
}

const emptyForm = (date: string): FormState => ({
  date,
  done: { wake: false, worship: false, exercise: false, meal: false, study: false, social: false, sleep: false },
  wakeTime: '', sleepTime: '', worshipNote: '', exerciseNote: '', exerciseMin: '', mealNote: '', studyNote: '', studyMin: '', socialNote: '', notes: '',
});

const formFromEntry = (e: KaihEntry): FormState => ({
  date: e.entry_date,
  done: { wake: e.wake_done, worship: e.worship_done, exercise: e.exercise_done, meal: e.meal_done, study: e.study_done, social: e.social_done, sleep: e.sleep_done },
  wakeTime: hhmm(e.wake_time), sleepTime: hhmm(e.sleep_time),
  worshipNote: e.worship_note ?? '', exerciseNote: e.exercise_note ?? '', exerciseMin: e.exercise_minutes != null ? String(e.exercise_minutes) : '',
  mealNote: e.meal_note ?? '', studyNote: e.study_note ?? '', studyMin: e.study_minutes != null ? String(e.study_minutes) : '',
  socialNote: e.social_note ?? '', notes: e.notes ?? '',
});

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string;
  /** Semua jurnal milik siswa (untuk mendeteksi tanggal yang sudah terisi) */
  entries: KaihEntry[];
  /** Jurnal yang diubah; null/undefined = jurnal baru */
  editEntry?: KaihEntry | null;
}

export function KaihEntryDialog({ open, onClose, studentId, entries, editEntry }: Props) {
  const qc = useQueryClient();
  const today = todayWib();
  const minDate = addDaysIso(today, -KAIH_EDIT_WINDOW_DAYS);
  const byDate = useMemo(() => new Map(entries.map((e) => [e.entry_date, e])), [entries]);
  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [editingId, setEditingId] = useState<string | null>(null);

  // Dibuka: muat jurnal yang diubah, atau jurnal hari ini bila sudah ada, atau formulir kosong
  useEffect(() => {
    if (!open) return;
    if (editEntry) {
      setForm(formFromEntry(editEntry));
      setEditingId(editEntry.id);
      return;
    }
    const existing = byDate.get(today);
    if (existing) {
      setForm(formFromEntry(existing));
      setEditingId(existing.id);
    } else {
      setForm(emptyForm(today));
      setEditingId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editEntry?.id]);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));
  const setDone = (k: HabitKey, v: boolean) => setForm((f) => ({ ...f, done: { ...f.done, [k]: v } }));

  // Mengganti tanggal ke tanggal yang sudah terisi: buka jurnal itu untuk diubah
  const changeDate = (date: string) => {
    if (!date) return patch({ date });
    const existing = byDate.get(date);
    if (existing) {
      setForm(formFromEntry(existing));
      setEditingId(existing.id);
      toast.info(`Jurnal ${fmtDateLong(date)} sudah ada, ditampilkan untuk diubah.`);
    } else {
      setForm((f) => ({ ...emptyForm(date), notes: f.notes }));
      setEditingId(null);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const f = form;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) throw new Error('Tanggal belum diisi.');
      if (f.date > today) throw new Error('Tanggal jurnal tidak boleh di masa depan.');
      if (f.date < minDate) throw new Error(`Jurnal hanya bisa diisi maksimal ${KAIH_EDIT_WINDOW_DAYS} hari ke belakang.`);
      const minutes = (raw: string, label: string) => {
        if (raw.trim() === '') return null;
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0 || n > 1440) throw new Error(`Durasi ${label} harus berupa angka 0–1440 menit.`);
        return n;
      };
      const payload = {
        entry_date: f.date,
        wake_done: f.done.wake, wake_time: f.wakeTime || null,
        worship_done: f.done.worship, worship_note: f.done.worship ? clean(f.worshipNote) || null : null,
        exercise_done: f.done.exercise, exercise_note: f.done.exercise ? clean(f.exerciseNote) || null : null,
        exercise_minutes: f.done.exercise ? minutes(f.exerciseMin, 'olahraga') : null,
        meal_done: f.done.meal, meal_note: f.done.meal ? clean(f.mealNote) || null : null,
        study_done: f.done.study, study_note: f.done.study ? clean(f.studyNote) || null : null,
        study_minutes: f.done.study ? minutes(f.studyMin, 'belajar') : null,
        social_done: f.done.social, social_note: f.done.social ? clean(f.socialNote) || null : null,
        sleep_done: f.done.sleep, sleep_time: f.sleepTime || null,
        notes: clean(f.notes) || null,
      };
      if (editingId) {
        const { error } = await db.from('kaih_journals').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await db.from('kaih_journals').insert({ student_id: studentId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? 'Jurnal diperbarui.' : 'Jurnal tersimpan. Terima kasih sudah mengisi!');
      qc.invalidateQueries({ queryKey: ['kaih-entries', studentId] });
      onClose();
    },
    onError: (e: any) => toast.error(kaihErrorMessage(e)),
  });

  const doneCount = HABITS.filter((h) => form.done[h.key]).length;
  const dateLocked = !!editEntry;

  const textField = (key: HabitKey, value: string, set: (v: string) => void, placeholder: string) =>
    form.done[key] && (
      <Textarea
        value={value}
        onChange={(e) => set(e.target.value)}
        maxLength={300}
        rows={2}
        placeholder={placeholder}
        aria-label={`Keterangan ${HABITS.find((h) => h.key === key)?.label}`}
      />
    );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !save.isPending) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Ubah Jurnal 7 Kebiasaan' : 'Isi Jurnal 7 Kebiasaan'}</DialogTitle>
          <DialogDescription>
            Aktifkan tombol pada kebiasaan yang sudah kamu lakukan hari itu. Isi dengan jujur ya.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Label htmlFor="kaih-date" className="text-xs">Tanggal</Label>
              <Input
                id="kaih-date"
                type="date"
                value={form.date}
                min={minDate}
                max={today}
                disabled={dateLocked}
                onChange={(e) => changeDate(e.target.value)}
                className="w-44"
              />
              <p className="mt-1 text-xs text-muted-foreground">Bisa diisi sampai {KAIH_EDIT_WINDOW_DAYS} hari ke belakang.</p>
            </div>
            <div className="rounded-md bg-primary/10 px-3 py-2 text-sm font-medium">{doneCount} dari 7 kebiasaan dilakukan</div>
          </div>

          {HABITS.map((h) => {
            const Icon = h.icon;
            return (
              <div key={h.key} className="space-y-3 rounded-lg border p-3" style={{ borderLeft: `4px solid ${h.color}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-lg p-2" style={{ background: `${h.color}22`, color: h.color }}><Icon className="h-4 w-4" /></span>
                    <div>
                      <div className="font-medium">{h.no}. {h.label}</div>
                      <p className="text-xs text-muted-foreground">{h.hint}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Label htmlFor={`done-${h.key}`} className="text-xs">{form.done[h.key] ? 'Ya' : 'Belum'}</Label>
                    <Switch id={`done-${h.key}`} checked={form.done[h.key]} onCheckedChange={(v) => setDone(h.key, v)} />
                  </div>
                </div>

                {h.key === 'wake' && (
                  <div>
                    <Label htmlFor="kaih-wake" className="text-xs">Jam bangun</Label>
                    <Input id="kaih-wake" type="time" value={form.wakeTime} onChange={(e) => patch({ wakeTime: e.target.value })} className="w-36" />
                  </div>
                )}
                {h.key === 'worship' && textField('worship', form.worshipNote, (v) => patch({ worshipNote: v }), 'Contoh: Salat Subuh berjamaah, berdoa, mengaji satu halaman')}
                {h.key === 'exercise' && form.done.exercise && (
                  <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                    <Textarea value={form.exerciseNote} onChange={(e) => patch({ exerciseNote: e.target.value })} maxLength={300} rows={2} placeholder="Contoh: Lari pagi di sekitar rumah, senam" aria-label="Keterangan Berolahraga" />
                    <div>
                      <Label htmlFor="kaih-ex-min" className="text-xs">Durasi (menit)</Label>
                      <Input id="kaih-ex-min" type="number" inputMode="numeric" min={0} max={1440} value={form.exerciseMin} onChange={(e) => patch({ exerciseMin: e.target.value })} />
                    </div>
                  </div>
                )}
                {h.key === 'meal' && textField('meal', form.mealNote, (v) => patch({ mealNote: v }), 'Contoh: Sarapan nasi, telur, sayur; makan buah pisang')}
                {h.key === 'study' && form.done.study && (
                  <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                    <Textarea value={form.studyNote} onChange={(e) => patch({ studyNote: e.target.value })} maxLength={300} rows={2} placeholder="Contoh: Mengerjakan tugas IPA, membaca buku cerita" aria-label="Keterangan Gemar Belajar" />
                    <div>
                      <Label htmlFor="kaih-st-min" className="text-xs">Durasi (menit)</Label>
                      <Input id="kaih-st-min" type="number" inputMode="numeric" min={0} max={1440} value={form.studyMin} onChange={(e) => patch({ studyMin: e.target.value })} />
                    </div>
                  </div>
                )}
                {h.key === 'social' && textField('social', form.socialNote, (v) => patch({ socialNote: v }), 'Contoh: Membantu ibu membersihkan rumah, kerja bakti di lingkungan')}
                {h.key === 'sleep' && (
                  <div>
                    <Label htmlFor="kaih-sleep" className="text-xs">Jam tidur (malam hari)</Label>
                    <Input id="kaih-sleep" type="time" value={form.sleepTime} onChange={(e) => patch({ sleepTime: e.target.value })} className="w-36" />
                  </div>
                )}
              </div>
            );
          })}

          <div>
            <Label htmlFor="kaih-notes" className="text-xs">Catatan / refleksi (opsional)</Label>
            <Textarea id="kaih-notes" value={form.notes} onChange={(e) => patch({ notes: e.target.value })} maxLength={1000} rows={3} placeholder="Apa yang kamu rasakan hari ini? Apa yang ingin diperbaiki besok?" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Batal</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingId ? 'Simpan Perubahan' : 'Simpan Jurnal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
