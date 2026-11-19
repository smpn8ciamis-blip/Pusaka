import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowDownUp, Save } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExamScheduleEditor } from '@/components/exam/ExamScheduleEditor';
import { scheduleOf, useExamSettings, useSaveExamSettings } from '@/hooks/useExamSettings';
import { sortSchedule, validateSchedule, type ExamSession } from '@/lib/examSchedule';

/** Panitia ujian: atur nama kegiatan ujian dan jadwal ujian (tampil di kartu ujian dan dokumen ujian). */
export default function PanitiaUjianJadwal() {
  const { data: settings, isLoading, error } = useExamSettings();
  const save = useSaveExamSettings();
  const [examName, setExamName] = useState('');
  const [schedule, setSchedule] = useState<ExamSession[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  // isi form dari server (hanya saat data server berubah)
  useEffect(() => {
    if (!settings) return;
    setExamName(String(settings.exam_name ?? ''));
    setSchedule(scheduleOf(settings));
  }, [settings]);

  const dirty = useMemo(
    () => !!settings && (examName !== String(settings.exam_name ?? '') || JSON.stringify(schedule) !== JSON.stringify(scheduleOf(settings))),
    [settings, examName, schedule],
  );

  const onSave = () => {
    const errs = validateSchedule(schedule);
    if (!examName.trim()) errs.unshift('Nama kegiatan ujian wajib diisi');
    setErrors(errs);
    if (errs.length) { toast.error('Periksa isian yang ditandai.'); return; }
    const sorted = sortSchedule(schedule);
    save.mutate(
      { examName: examName.trim(), schedule: sorted },
      {
        onSuccess: () => { setSchedule(sorted); toast.success('Nama dan jadwal ujian tersimpan.'); },
        onError: (e: any) => toast.error(e?.message || 'Gagal menyimpan.'),
      },
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Nama &amp; Jadwal Ujian</h1>
            <p className="text-muted-foreground">Nama kegiatan dan jadwal ini dipakai pada kartu ujian dan dokumen ujian.</p>
          </div>
          <Button variant="outline" asChild><Link to="/exam-administration">Buka Administrasi Ujian</Link></Button>
        </div>

        {error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as any)?.message || 'Gagal memuat pengaturan ujian.'}
          </p>
        )}
        {!isLoading && !error && !settings && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Pengaturan sekolah belum dibuat. Minta admin mengisi Pengaturan Sekolah terlebih dahulu.
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Nama kegiatan ujian</CardTitle>
            <CardDescription>Contoh: PENILAIAN SUMATIF AKHIR SEMESTER (PSAS)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label htmlFor="exam-name">Nama kegiatan</Label>
            <Input id="exam-name" value={examName} maxLength={200} onChange={(e) => setExamName(e.target.value)} disabled={!settings} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Jadwal ujian</CardTitle>
              <CardDescription>Dalam 1 hari boleh ada beberapa sesi. Saat disimpan, sesi diurutkan menurut tanggal dan jam.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setSchedule(sortSchedule(schedule))} disabled={schedule.length < 2}>
              <ArrowDownUp className="mr-1.5 h-4 w-4" /> Urutkan
            </Button>
          </CardHeader>
          <CardContent>
            <ExamScheduleEditor value={schedule} onChange={(v) => { setSchedule(v); setErrors([]); }} />
          </CardContent>
        </Card>

        {errors.length > 0 && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Perbaiki dulu sebelum menyimpan:</div>
            <ul className="list-disc pl-5 space-y-0.5">{errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}</ul>
            {errors.length > 12 && <p className="mt-1">…dan {errors.length - 12} lainnya.</p>}
          </div>
        )}

        <div className="sticky bottom-3 flex items-center justify-end gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
          <span className="mr-auto text-sm text-muted-foreground">{dirty ? 'Ada perubahan yang belum disimpan.' : 'Semua perubahan sudah tersimpan.'}</span>
          <Button onClick={onSave} disabled={!dirty || save.isPending || !settings}>
            <Save className="mr-1.5 h-4 w-4" /> {save.isPending ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
