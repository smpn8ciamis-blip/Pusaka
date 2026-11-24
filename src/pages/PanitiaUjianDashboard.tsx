import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ClipboardList, FileText, UserCheck, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { scheduleOf, useExamSettings } from '@/hooks/useExamSettings';
import { sessionDate, upcomingSessions } from '@/lib/examSchedule';

/** Jumlah siswa aktif per tingkat (dasar penyusunan ruang dan kartu ujian). */
function useActiveStudentsByGrade() {
  return useQuery({
    queryKey: ['panitia-ujian-siswa-aktif'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('students')
        .select('id, classes ( grade )')
        .eq('status', 'aktif')
        .eq('is_alumni', false);
      if (error) throw error;
      const by: Record<string, number> = {};
      for (const s of data || []) {
        const g = String(s.classes?.grade ?? '-');
        by[g] = (by[g] || 0) + 1;
      }
      return { total: (data || []).length, by };
    },
  });
}

export default function PanitiaUjianDashboard() {
  const { data: settings, isLoading, error } = useExamSettings();
  const students = useActiveStudentsByGrade();
  const schedule = useMemo(() => scheduleOf(settings), [settings]);
  const upcoming = useMemo(() => upcomingSessions(schedule), [schedule]);
  const next = upcoming[0];
  const days = useMemo(() => new Set(schedule.map((s) => sessionDate(s)?.toDateString()).filter(Boolean)).size, [schedule]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Panitia Ujian</h1>
          <p className="text-muted-foreground">Kelola nama, jadwal, denah ruang, dan kartu ujian.</p>
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><ClipboardList className="h-4 w-4" /> Kegiatan ujian</CardDescription></CardHeader>
            <CardContent>
              <div className="font-semibold leading-snug">{isLoading ? '…' : (settings?.exam_name || 'Belum diatur')}</div>
              {settings?.academic_year && <div className="text-xs text-muted-foreground mt-1">Tahun pelajaran {String(settings.academic_year)}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Jadwal</CardDescription></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{schedule.length} <span className="text-sm font-normal text-muted-foreground">sesi</span></div>
              <div className="text-xs text-muted-foreground">{days} hari ujian</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Sesi berikutnya</CardDescription></CardHeader>
            <CardContent>
              {next ? (
                <>
                  <div className="font-semibold leading-snug">{next.subject}</div>
                  <div className="text-xs text-muted-foreground mt-1">{next.day}, {next.date} · {next.time}</div>
                </>
              ) : <div className="text-sm text-muted-foreground">{schedule.length ? 'Semua sesi sudah lewat' : 'Belum ada jadwal'}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Peserta (siswa aktif)</CardDescription></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{students.isLoading ? '…' : students.data?.total ?? '—'}</div>
              {students.data && (
                <div className="text-xs text-muted-foreground">
                  {Object.entries(students.data.by).sort(([a], [b]) => a.localeCompare(b)).map(([g, n]) => `Kelas ${g}: ${n}`).join(' · ')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Nama &amp; Jadwal Ujian</CardTitle>
              <CardDescription>Atur nama kegiatan dan tambah, ubah, atau hapus sesi ujian.</CardDescription>
            </CardHeader>
            <CardContent><Button asChild><Link to="/panitia-ujian/jadwal">Kelola jadwal</Link></Button></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Administrasi Ujian</CardTitle>
              <CardDescription>Denah ruang, nomor peserta, dan cetak kartu ujian.</CardDescription>
            </CardHeader>
            <CardContent><Button asChild variant="outline"><Link to="/exam-administration">Buka Administrasi Ujian</Link></Button></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" /> Jadwal Pengawas</CardTitle>
              <CardDescription>Susun pengawas tiap ruang per sesi (otomatis atau manual), lihat matriks, dan cetak PDF.</CardDescription>
            </CardHeader>
            <CardContent><Button asChild variant="outline"><Link to="/panitia-ujian/pengawas">Kelola jadwal pengawas</Link></Button></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Kehadiran Siswa per Ruang</CardTitle>
              <CardDescription>Pantau daftar hadir tiap ruang yang diisi pengawas. Pengawas sesi pertama wajib mengabsen.</CardDescription>
            </CardHeader>
            <CardContent><Button asChild variant="outline"><Link to="/panitia-ujian/kehadiran">Pantau kehadiran</Link></Button></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Cetak Siswa Tidak Hadir</CardTitle>
              <CardDescription>Daftar siswa sakit, izin, dan alpa per hari ujian: PDF berkop dengan tanda tangan ketua panitia.</CardDescription>
            </CardHeader>
            <CardContent><Button asChild variant="outline"><Link to="/panitia-ujian/tidak-hadir">Cetak daftar</Link></Button></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Jadwal mendatang</CardTitle>
            <CardDescription>Sepuluh sesi terdekat.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada sesi mendatang.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Hari, tanggal</th><th className="py-2 pr-3 font-medium">Jam</th>
                    <th className="py-2 pr-3 font-medium">Mata pelajaran</th><th className="py-2 font-medium text-right">Durasi</th>
                  </tr></thead>
                  <tbody>
                    {upcoming.slice(0, 10).map((s, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{s.day}, {s.date}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{s.time}</td>
                        <td className="py-2 pr-3">{s.subject}</td>
                        <td className="py-2 text-right whitespace-nowrap">{s.duration ? `${s.duration} menit` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
