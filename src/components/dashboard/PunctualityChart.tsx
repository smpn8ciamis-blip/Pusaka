import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer } from 'lucide-react';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

const ON_TIME = 'hsl(142, 76%, 36%)';
const LATE = 'hsl(25, 95%, 53%)';

const toStr = (d: Date) => format(d, 'yyyy-MM-dd');

export const PunctualityChart = ({
  startDate,
  endDate,
  classId,
  title = 'Ketepatan Waktu Kehadiran (Absensi Kartu RFID)',
}: {
  startDate: Date;
  endDate: Date;
  classId?: string | null;
  title?: string;
}) => {
  const { data } = useQuery({
    queryKey: ['punctuality-stats', toStr(startDate), toStr(endDate), classId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_punctuality_stats', {
        p_start_date: toStr(startDate),
        p_end_date: toStr(endDate),
        p_class_id: classId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as { date: string; tepat_waktu: number; terlambat: number }[];
    },
  });

  const rows = useMemo(
    () =>
      (data ?? []).map((r) => ({
        date: format(new Date(r.date), 'dd/MM'),
        tepat: Number(r.tepat_waktu || 0),
        terlambat: Number(r.terlambat || 0),
      })),
    [data],
  );

  const totalTepat = rows.reduce((a, r) => a + r.tepat, 0);
  const totalTerlambat = rows.reduce((a, r) => a + r.terlambat, 0);
  const total = totalTepat + totalTerlambat;
  const pctTepat = total > 0 ? Math.round((totalTepat / total) * 100) : 0;
  const pctTerlambat = total > 0 ? 100 - pctTepat : 0;

  const pie = [
    { name: 'Tepat Waktu', value: totalTepat, color: ON_TIME },
    { name: 'Terlambat', value: totalTerlambat, color: LATE },
  ];

  return (
    <Card className="border-none shadow-md">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          {title}
          <span className="text-xs font-normal text-muted-foreground">
            ({format(startDate, 'dd/MM/yyyy')} - {format(endDate, 'dd/MM/yyyy')})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total > 0 ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-3">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Tepat Waktu</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold" style={{ color: ON_TIME }}>{pctTepat}%</p>
                  <Badge variant="outline">{totalTepat} tap</Badge>
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Terlambat</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold" style={{ color: LATE }}>{pctTerlambat}%</p>
                  <Badge variant="outline">{totalTerlambat} tap</Badge>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {pie.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="lg:col-span-2 overflow-x-auto">
              <ResponsiveContainer width="100%" height={340} minWidth={300}>
                <BarChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="tepat" stackId="a" fill={ON_TIME} name="Tepat Waktu" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="terlambat" stackId="a" fill={LATE} name="Terlambat" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            Belum ada data tap kartu RFID pada periode ini
          </div>
        )}
      </CardContent>
    </Card>
  );
};
