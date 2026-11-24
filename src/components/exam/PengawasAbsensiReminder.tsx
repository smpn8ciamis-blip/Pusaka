import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { hhmmToMin, wibNow, type MyInvSession } from '@/lib/examAttendance';

/** Pengingat di dashboard guru: tugas mengawas hari ini; pengawas sesi pertama wajib mengabsen siswa ruangnya. */
export function PengawasAbsensiReminder() {
  const { data } = useQuery({
    queryKey: ['pengawas-hari-ini'],
    refetchInterval: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('exam_my_invigilation');
      if (error) throw error;
      return (data?.sessions ?? []) as MyInvSession[];
    },
  });
  if (!data || data.length === 0) return null;
  const now = wibNow();
  const required = data.filter((s) => s.is_first && s.filled_count === 0 && now.minutes >= hhmmToMin(s.start_time) - 30);
  const upcoming = data.filter((s) => !(s.is_first && s.filled_count === 0 && now.minutes >= hhmmToMin(s.start_time) - 30));
  return (
    <div className="space-y-3">
      {required.map((s) => (
        <Alert key={`${s.start_time}-${s.room_no}`} variant="destructive">
          <ClipboardCheck className="h-4 w-4" />
          <AlertTitle>Wajib: absensi siswa Ruang {s.room_no}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Anda pengawas sesi pertama ({s.start_time}{s.subject ? ` · ${s.subject}` : ''}). Absensi {s.student_count} siswa di ruang ini belum diisi.</span>
            <Button asChild size="sm" variant="outline"><Link to="/absensi-pengawas">Isi absensi sekarang</Link></Button>
          </AlertDescription>
        </Alert>
      ))}
      {upcoming.length > 0 && (
        <Alert>
          <ClipboardCheck className="h-4 w-4" />
          <AlertTitle>Tugas mengawas hari ini</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{upcoming.map((s) => `Ruang ${s.room_no} (${s.start_time}${s.is_first ? ', sesi pertama' : ''}${s.filled_count > 0 ? ', absensi terisi' : ''})`).join(' · ')}</span>
            <Button asChild size="sm" variant="outline"><Link to="/absensi-pengawas">Buka absensi pengawas</Link></Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
