import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Lock, Save } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import {
  ATT_LABEL, ATT_STATUSES, countStatuses, fmtDateId, initialStatus, sessionOpen, wibNow,
  type AttStatus, type MyInvSession, type RoomStudent,
} from '@/lib/examAttendance';

const db = supabase as any;
const STATUS_STYLE: Record<AttStatus, string> = {
  hadir: 'bg-green-600 text-white hover:bg-green-600',
  sakit: 'bg-orange-500 text-white hover:bg-orange-500',
  izin: 'bg-blue-600 text-white hover:bg-blue-600',
  alpa: 'bg-red-600 text-white hover:bg-red-600',
};

/** Pengawas ruang: absensi siswa di ruang yang diawasi, sesuai jadwal pengawas. Hasilnya masuk ke daftar hadir kelas. */
export default function AbsensiPengawas() {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => wibNow().date);
  const [sel, setSel] = useState<{ start: string; room: number } | null>(null);
  const [rows, setRows] = useState<Record<string, { status: AttStatus; notes: string }>>({});
  const [dirty, setDirty] = useState(false);

  const mine = useQuery({
    queryKey: ['pengawas-tugas', date],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('exam_my_invigilation', { p_date: date });
      if (error) throw error;
      return (data?.sessions ?? []) as MyInvSession[];
    },
  });
  const sessions = mine.data ?? [];

  // pilih otomatis sesi pertama yang belum terisi (atau sesi pertama) bila belum ada pilihan
  useEffect(() => {
    if (sel && sessions.some((s) => s.start_time === sel.start && s.room_no === sel.room)) return;
    const pick = sessions.find((s) => s.filled_count === 0) ?? sessions[0];
    setSel(pick ? { start: pick.start_time, room: pick.room_no } : null);
  }, [sessions, sel]);

  const current = sessions.find((s) => sel && s.start_time === sel.start && s.room_no === sel.room) ?? null;

  const roomQ = useQuery({
    queryKey: ['pengawas-ruang', date, sel?.start, sel?.room],
    enabled: !!sel,
    queryFn: async () => {
      const { data, error } = await db.rpc('exam_room_attendance_get', { p_date: date, p_start_time: sel!.start, p_room: sel!.room });
      if (error) throw error;
      return data as { students: RoomStudent[]; is_first: boolean; subject: string };
    },
  });
  const students = roomQ.data?.students ?? [];

  // isi form dari server hanya saat data ruang berubah dan belum ada suntingan
  useEffect(() => {
    if (!roomQ.data || dirty) return;
    const next: Record<string, { status: AttStatus; notes: string }> = {};
    for (const s of roomQ.data.students) next[s.student_id] = { status: initialStatus(s), notes: s.saved_notes ?? '' };
    setRows(next);
  }, [roomQ.data, dirty]);

  const open = !!current && sessionOpen(date, current.start_time);
  const counts = useMemo(() => countStatuses(students.map((s) => ({ status: rows[s.student_id]?.status ?? null }))), [students, rows]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = students.map((s) => ({ student_id: s.student_id, status: rows[s.student_id]?.status ?? 'hadir', notes: rows[s.student_id]?.notes?.trim() || null }));
      const { data, error } = await db.rpc('exam_room_attendance_save', { p_date: date, p_start_time: sel!.start, p_room: sel!.room, p_rows: payload });
      if (error) throw error;
      return data as { saved: number; mirrored: number; no_schedule: number };
    },
    onSuccess: (r) => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['pengawas-tugas'] });
      qc.invalidateQueries({ queryKey: ['pengawas-hari-ini'] });
      qc.invalidateQueries({ queryKey: ['pengawas-ruang'] });
      toast.success(`Absensi Ruang ${sel?.room} tersimpan (${r.saved} siswa) dan masuk ke daftar hadir kelas.`);
      if (r.no_schedule > 0) {
        toast.warning(`${r.no_schedule} siswa tersimpan di data ruang tetapi belum masuk daftar hadir kelas karena kelasnya belum punya jadwal pelajaran.`, { duration: 9000 });
      }
    },
    onError: (e: any) => toast.error(e?.message || 'Gagal menyimpan absensi.'),
  });

  const setStatus = (id: string, status: AttStatus) => { setRows((r) => ({ ...r, [id]: { status, notes: r[id]?.notes ?? '' } })); setDirty(true); };
  const setNotes = (id: string, notes: string) => { setRows((r) => ({ ...r, [id]: { status: r[id]?.status ?? 'hadir', notes } })); setDirty(true); };
  const allPresent = () => {
    setRows((r) => Object.fromEntries(students.map((s) => [s.student_id, { status: 'hadir' as AttStatus, notes: r[s.student_id]?.notes ?? '' }])));
    setDirty(true);
  };
  const choose = (s: MyInvSession) => {
    if (dirty && !window.confirm('Ada perubahan yang belum disimpan. Pindah sesi dan buang perubahan?')) return;
    setDirty(false);
    setSel({ start: s.start_time, room: s.room_no });
  };

  const needFirst = sessions.some((s) => s.is_first && s.filled_count === 0);

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Absensi Pengawas Ruang</h1>
            <p className="text-muted-foreground">Absen siswa di ruang yang Anda awasi. Hasilnya masuk ke daftar hadir kelas seperti absen biasa.</p>
          </div>
          <div className="space-y-1">
            <label htmlFor="tgl" className="text-xs text-muted-foreground">Tanggal ujian</label>
            <Input id="tgl" type="date" value={date} onChange={(e) => { if (dirty && !window.confirm('Buang perubahan yang belum disimpan?')) return; setDirty(false); setSel(null); setDate(e.target.value || wibNow().date); }} />
          </div>
        </div>

        {mine.error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(mine.error as any)?.message || 'Gagal memuat tugas mengawas.'} Bila pesan menyebut fungsi tidak ditemukan, migrasi absensi pengawas belum dijalankan.
          </p>
        )}

        {!mine.isLoading && !mine.error && sessions.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Anda tidak memiliki tugas mengawas pada {fmtDateId(date)}. Jadwal pengawas disusun oleh panitia ujian.
          </CardContent></Card>
        )}

        {needFirst && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Wajib mengabsen</AlertTitle>
            <AlertDescription>Anda pengawas sesi pertama. Absensi siswa di ruang Anda wajib diisi dan dipantau panitia.</AlertDescription>
          </Alert>
        )}

        {sessions.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {sessions.map((s) => {
              const active = !!sel && sel.start === s.start_time && sel.room === s.room_no;
              return (
                <button key={`${s.start_time}-${s.room_no}`} type="button" onClick={() => choose(s)}
                  className={`rounded-xl border p-3 text-left transition-colors ${active ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Ruang {s.room_no}</span>
                    <span className="flex gap-1">
                      {s.is_first && <Badge variant="destructive">Wajib (sesi 1)</Badge>}
                      {s.filled_count > 0
                        ? <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Terisi</Badge>
                        : <Badge variant="secondary">Belum diabsen</Badge>}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{s.start_time}{s.end_time ? `–${s.end_time}` : ''} · {s.subject || 'Ujian'} · {s.student_count} siswa</div>
                </button>
              );
            })}
          </div>
        )}

        {current && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Ruang {current.room_no} — {current.subject || 'Ujian'} ({current.start_time})</CardTitle>
              <CardDescription>Pilih status tiap siswa. Siswa hanya yang terdaftar di ruang ini. Keterangan boleh diisi untuk sakit, izin, atau alpa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!open && (
                <Alert>
                  <Lock className="h-4 w-4" />
                  <AlertTitle>Belum bisa disimpan</AlertTitle>
                  <AlertDescription>
                    {date !== wibNow().date ? 'Absensi pengawas hanya dapat disimpan pada hari ujian.' : `Absensi dibuka 30 menit sebelum sesi mulai (pukul ${current.start_time}).`}
                  </AlertDescription>
                </Alert>
              )}
              {roomQ.error && <p className="text-sm text-destructive">{(roomQ.error as any)?.message || 'Gagal memuat siswa ruang.'}</p>}
              {!roomQ.isLoading && students.length === 0 && !roomQ.error && (
                <p className="text-sm text-muted-foreground">Belum ada siswa untuk ruang ini. Panitia perlu menyimpan denah ruang siswa di halaman Jadwal Pengawas.</p>
              )}

              {students.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Button type="button" size="sm" variant="outline" onClick={allPresent} disabled={!open}>Semua hadir</Button>
                    <span className="ml-auto flex flex-wrap gap-1.5">
                      {ATT_STATUSES.map((k) => <Badge key={k} variant="outline">{ATT_LABEL[k]} {counts[k]}</Badge>)}
                    </span>
                  </div>
                  <div className="divide-y rounded-lg border">
                    {students.map((s) => {
                      const r = rows[s.student_id] ?? { status: 'hadir' as AttStatus, notes: '' };
                      return (
                        <div key={s.student_id} className="space-y-1.5 p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{s.table_no ? `${s.table_no}. ` : ''}{s.full_name}</div>
                              <div className="text-xs text-muted-foreground">{s.class_name}{s.exam_number ? ` · No. peserta ${s.exam_number}` : ''}</div>
                            </div>
                            <div className="flex gap-1">
                              {ATT_STATUSES.map((k) => (
                                <Button key={k} type="button" size="sm" disabled={!open}
                                  variant={r.status === k ? 'default' : 'outline'}
                                  className={`h-8 px-2.5 text-xs ${r.status === k ? STATUS_STYLE[k] : ''}`}
                                  onClick={() => setStatus(s.student_id, k)}>{ATT_LABEL[k]}</Button>
                              ))}
                            </div>
                          </div>
                          {r.status !== 'hadir' && (
                            <Input value={r.notes} maxLength={300} disabled={!open} placeholder="Keterangan (opsional)" onChange={(e) => setNotes(s.student_id, e.target.value)} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="sticky bottom-3 flex items-center justify-end gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
                    <span className="mr-auto text-sm text-muted-foreground">{dirty ? 'Ada perubahan yang belum disimpan.' : current.filled_count > 0 ? 'Absensi sudah tersimpan.' : 'Belum disimpan.'}</span>
                    <Button onClick={() => save.mutate()} disabled={!open || save.isPending}>
                      <Save className="mr-1.5 h-4 w-4" /> {save.isPending ? 'Menyimpan…' : 'Simpan absensi'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
