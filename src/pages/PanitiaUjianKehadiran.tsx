import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Printer, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { ATT_LABEL, ATT_STATUSES, countStatuses, fmtDateId, hhmmToMin, wibNow, type AttStatus, type OvStudent } from '@/lib/examAttendance';

interface OvSession { start_time: string; end_time: string; subject: string; is_first: boolean; pengawas: { teacher_id: string; name: string }[]; filled_count: number; recorded_at: string | null; recorded_by: string | null }
interface OvRoom { room_no: number; sessions: OvSession[]; students: OvStudent[] }
interface Overview { date: string; first_start: string | null; rooms: OvRoom[] }

const DOT: Record<AttStatus, string> = { hadir: 'text-green-700', sakit: 'text-orange-600', izin: 'text-blue-600', alpa: 'text-red-600' };

/** Panitia ujian: pantau daftar hadir siswa per ruang (diisi pengawas), sesi pertama wajib. */
export default function PanitiaUjianKehadiran() {
  const [date, setDate] = useState(() => wibNow().date);
  const [onlyMissing, setOnlyMissing] = useState(false);

  const q = useQuery({
    queryKey: ['panitia-kehadiran-ruang', date],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('exam_room_attendance_overview', { p_date: date });
      if (error) throw error;
      return data as Overview;
    },
  });

  const now = wibNow();
  const view = useMemo(() => {
    const rooms = (q.data?.rooms ?? []).map((r) => {
      const first = r.sessions.find((s) => s.is_first) ?? null;
      const late = !!first && first.filled_count === 0 && date === now.date && now.minutes >= hhmmToMin(first.start_time);
      const waiting = !!first && first.filled_count === 0 && !late;
      const counts = countStatuses(r.students);
      return { r, first, late, waiting, counts, noSchedule: r.sessions.length === 0 };
    });
    const students = rooms.reduce((a, x) => a + x.r.students.length, 0);
    const filled = rooms.reduce((a, x) => a + x.r.students.length - x.counts.belum, 0);
    const tot = countStatuses(rooms.flatMap((x) => x.r.students));
    return { rooms, students, filled, tot, lateRooms: rooms.filter((x) => x.late).length, doneRooms: rooms.filter((x) => x.first && x.first.filled_count > 0).length, firstRooms: rooms.filter((x) => x.first).length };
  }, [q.data, date, now.date, now.minutes]);

  const shown = onlyMissing ? view.rooms.filter((x) => x.late || x.waiting || (x.first && x.first.filled_count === 0)) : view.rooms;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Kehadiran Siswa per Ruang</h1>
            <p className="text-muted-foreground">Absensi diisi pengawas ruang; pengawas sesi pertama wajib mengisi. Data diperbarui otomatis tiap 30 detik.</p>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="tgl" className="text-xs text-muted-foreground">Tanggal ujian</Label>
              <Input id="tgl" type="date" value={date} onChange={(e) => setDate(e.target.value || wibNow().date)} />
            </div>
            <Button variant="outline" asChild><Link to={`/panitia-ujian/tidak-hadir?tanggal=${date}`}><Printer className="mr-2 h-4 w-4" /> Cetak tidak hadir</Link></Button>
            <Button variant="outline" size="icon" onClick={() => q.refetch()} aria-label="Muat ulang"><RefreshCw className={`h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} /></Button>
          </div>
        </div>

        {q.error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(q.error as any)?.message || 'Gagal memuat data.'} Bila pesan menyebut fungsi tidak ditemukan, migrasi absensi pengawas belum dijalankan.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardDescription>Ruang sesi pertama sudah absen</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold">{view.doneRooms}<span className="text-sm font-normal text-muted-foreground"> / {view.firstRooms} ruang</span></div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Terlambat mengabsen (wajib)</CardDescription></CardHeader>
            <CardContent><div className={`text-2xl font-bold ${view.lateRooms ? 'text-destructive' : ''}`}>{view.lateRooms} <span className="text-sm font-normal text-muted-foreground">ruang</span></div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Siswa sudah diabsen</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-bold">{view.filled}<span className="text-sm font-normal text-muted-foreground"> / {view.students}</span></div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Rekap hari ini</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5 text-xs">
              {ATT_STATUSES.map((k) => <Badge key={k} variant="outline">{ATT_LABEL[k]} {view.tot[k]}</Badge>)}
            </CardContent></Card>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><Switch id="mis" checked={onlyMissing} onCheckedChange={setOnlyMissing} /><Label htmlFor="mis">Hanya ruang yang absen sesi pertamanya belum terisi</Label></div>
          <span className="ml-auto text-sm text-muted-foreground">{fmtDateId(date)}{q.data?.first_start ? ` · sesi pertama pukul ${q.data.first_start}` : ''}</span>
        </div>

        {!q.isLoading && !q.error && view.rooms.length === 0 && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Belum ada data ruang. Susun jadwal pengawas dan simpan denah ruang siswa di <Link className="underline" to="/panitia-ujian/pengawas">Jadwal Pengawas</Link>.
          </CardContent></Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map(({ r, first, late, waiting, counts, noSchedule }) => (
            <Card key={r.room_no} className={late ? 'border-destructive' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Ruang {r.room_no}</span>
                  {first ? (
                    first.filled_count > 0
                      ? <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Sesi 1 sudah absen</Badge>
                      : late ? <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Sesi 1 belum absen</Badge>
                        : <Badge variant="secondary">{waiting ? 'Menunggu sesi 1' : 'Belum absen'}</Badge>
                  ) : noSchedule ? <Badge variant="outline">Tidak ada jadwal pengawas</Badge> : <Badge variant="outline">Tanpa sesi pertama</Badge>}
                </CardTitle>
                <CardDescription>
                  {r.students.length} siswa · {ATT_STATUSES.map((k) => `${ATT_LABEL[k]} ${counts[k]}`).join(' · ')} · belum {counts.belum}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="divide-y rounded-lg border text-sm">
                  {r.sessions.map((s) => (
                    <div key={s.start_time} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2.5 py-1.5">
                      <span className="font-medium tabular-nums">{s.start_time}{s.end_time ? `–${s.end_time}` : ''}</span>
                      {s.is_first && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">wajib</Badge>}
                      <span className="text-muted-foreground">{s.pengawas.map((p) => p.name).join(', ')}</span>
                      <span className="ml-auto text-xs">
                        {s.filled_count > 0
                          ? <span className="text-green-700">{s.filled_count}/{r.students.length} diabsen{s.recorded_by ? ` oleh ${s.recorded_by}` : ''}{s.recorded_at ? ` · ${new Date(s.recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}` : ''}</span>
                          : <span className="text-muted-foreground">belum</span>}
                      </span>
                    </div>
                  ))}
                  {r.sessions.length === 0 && <div className="px-2.5 py-1.5 text-muted-foreground">Belum ada pengawas pada tanggal ini.</div>}
                </div>
                <details className="rounded-lg border">
                  <summary className="cursor-pointer select-none px-2.5 py-1.5 text-sm font-medium">Daftar hadir siswa ({r.students.length})</summary>
                  <div className="max-h-72 overflow-y-auto border-t">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted"><tr><th className="w-8 p-1.5 text-center">No</th><th className="p-1.5 text-left">Nama</th><th className="p-1.5 text-left">Kelas</th><th className="p-1.5 text-left">Status</th></tr></thead>
                      <tbody>
                        {r.students.map((s, i) => (
                          <tr key={s.student_id} className="border-t">
                            <td className="p-1.5 text-center">{s.table_no ?? i + 1}</td>
                            <td className="p-1.5">{s.full_name}</td>
                            <td className="p-1.5">{s.class_name}</td>
                            <td className={`p-1.5 font-medium ${s.status ? DOT[s.status] : 'text-muted-foreground'}`}>{s.status ? ATT_LABEL[s.status] : 'Belum'}{s.notes ? <span className="font-normal text-muted-foreground"> · {s.notes}</span> : null}</td>
                          </tr>
                        ))}
                        {r.students.length === 0 && <tr><td colSpan={4} className="p-2 text-muted-foreground">Denah ruang siswa belum disimpan.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
