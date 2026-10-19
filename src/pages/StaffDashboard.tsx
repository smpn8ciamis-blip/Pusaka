import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileCheck, Fingerprint } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { PiketDuty, recordedRows, toISODate, keteranganText, DEFAULT_CFG, PiketCfg } from '@/lib/piket';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
    queryKey: ['my-piket-chart', me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const today = new Date();
      const iso = toISODate(new Date(today.getFullYear(), today.getMonth() - 5, 1));
      const { data, error } = await supabase
        .from('piket_duties' as any).select('*').eq('staff_id', me.id).gte('duty_date', iso).order('duty_date');
      if (error) throw error;
      return (data as any[]) as PiketDuty[];
    },
  });
  const { data: cfg = DEFAULT_CFG } = useQuery({
    queryKey: ['piket-cfg'],
    queryFn: async () => {
      const { data } = await supabase.from('piket_settings' as any).select('*').eq('id', 1).maybeSingle();
      return ({ ...DEFAULT_CFG, ...((data as any) ?? {}) }) as PiketCfg;
    },
  });

  // Grafik: jumlah hari hadir piket per bulan (6 bulan terakhir), hanya yang ada absen
  const chart = (() => {
    const today = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - 5 + i, 1);
      return { key: toISODate(d).slice(0, 7), label: new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d), malam: 0, weekend: 0, terlambat: 0 };
    });
    recordedRows(duties).filter((d) => d.status === 'hadir').forEach((d) => {
      const m = months.find((x) => x.key === d.duty_date.slice(0, 7));
      if (!m) return;
      if (d.shift_type === 'malam') m.malam++; else m.weekend++;
      if (keteranganText(d, undefined, cfg).includes('Terlambat')) m.terlambat++;
    });
    const total = months.reduce((n, m) => n + m.malam + m.weekend, 0);
    const late = months.reduce((n, m) => n + m.terlambat, 0);
    return { months, total, late };
  })();

  const links = [
    { to: '/my-piket', icon: Fingerprint, title: 'Log Piket Saya', desc: 'Riwayat absensi piket malam & Sabtu–Minggu dari fingerprint.' },
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
            <CardTitle className="text-base">Grafik Kehadiran Piket</CardTitle>
            <CardDescription>
              Hari hadir piket per bulan (6 bulan terakhir) dari data fingerprint · {chart.total} hari hadir{chart.late ? `, ${chart.late} terlambat` : ''}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chart.total === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada kehadiran piket tercatat.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.months} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                    <Legend />
                    <Bar dataKey="malam" name="Piket Malam" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="weekend" name="Piket Sabtu–Minggu" stackId="a" fill="hsl(var(--primary) / 0.45)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
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
