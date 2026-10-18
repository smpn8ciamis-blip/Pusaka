import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { SHIFT_LABEL, STATUS_LABEL, hariLabel, jamWIB, PiketDuty } from '@/lib/piket';

const TYPE_LABEL: Record<string, string> = { tata_usaha: 'Tata Usaha', karyawan: 'Karyawan' };

function StaffDashboardPage() {
  const { user } = useAuth();
  const { data: me } = useQuery({
    queryKey: ['my-staff-profile', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('staff' as any).select('*').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: duties = [] } = useQuery({
    queryKey: ['my-piket', me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
      const { data, error } = await supabase
        .from('piket_duties' as any).select('*').eq('staff_id', me.id).neq('status', 'ditolak').gte('duty_date', iso).order('duty_date');
      if (error) throw error;
      return (data as any[]) as PiketDuty[];
    },
  });

  const links = [
    { to: '/my-letters', icon: FileCheck, title: 'Surat Tugas Saya', desc: 'Lihat surat tugas dan unggah bukti kunjungan.' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Halo, {me?.full_name ?? 'Staf'} 👋</h1>
          <p className="text-sm text-muted-foreground">Dashboard staf sekolah</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profil</CardTitle>
            <CardDescription>Data diatur oleh admin sekolah.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Jenis: </span>{me ? TYPE_LABEL[me.staff_type] : '-'}</div>
            <div><span className="text-muted-foreground">Jabatan: </span>{me?.position || '-'}</div>
            <div><span className="text-muted-foreground">No. HP: </span>{me?.phone || '-'}</div>
            <div><span className="text-muted-foreground">PIN fingerprint: </span>{me?.fingerprint_pin || '-'}</div>
            <div><Badge variant={me?.status === 'nonaktif' ? 'outline' : 'default'}>{me?.status === 'nonaktif' ? 'Nonaktif' : 'Aktif'}</Badge></div>
          </CardContent>
        </Card>
        <Card id="piket">
          <CardHeader>
            <CardTitle className="text-base">Jadwal Piket Saya</CardTitle>
            <CardDescription>Bulan ini dan seterusnya. Kehadiran diambil dari data fingerprint.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {duties.length === 0 ? (
              <p className="text-muted-foreground">Belum ada jadwal piket untuk Anda.</p>
            ) : duties.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                <div>
                  <div className="font-medium">{hariLabel(d.duty_date)}, {d.duty_date.split('-').reverse().join('/')}</div>
                  <div className="text-xs text-muted-foreground">{SHIFT_LABEL[d.shift_type]} · Datang {jamWIB(d.check_in_at)} · Pulang {jamWIB(d.check_out_at)}</div>
                </div>
                <Badge variant={d.status === 'hadir' ? 'default' : 'outline'}>{STATUS_LABEL[d.status]}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((l) => (
            <Link key={l.to} to={l.to}>
              <Card className="h-full transition hover:shadow-md">
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <l.icon className="h-6 w-6 text-primary" />
                  <div><CardTitle className="text-base">{l.title}</CardTitle><CardDescription>{l.desc}</CardDescription></div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function StaffDashboard() {
  return <ProtectedRoute allowedRoles={['staf']}><StaffDashboardPage /></ProtectedRoute>;
}
