import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, Activity } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface DashboardLateStudentsProps {
  lateStudents: any[];
  lateViolationsTrend: any[];
  getPeriodLabel: () => string;
  onStudentClick: (student: any) => void;
}

export const DashboardLateStudents = ({
  lateStudents,
  lateViolationsTrend,
  getPeriodLabel,
  onStudentClick
}: DashboardLateStudentsProps) => {
  if (!lateStudents || lateStudents.length === 0) return null;

  return (
    <>
      {/* Late Students Table */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Rekap Siswa Sering Terlambat
            </CardTitle>
            <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
              {getPeriodLabel()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-3">No</th>
                  <th className="text-left py-3 px-3">Nama Siswa</th>
                  <th className="text-center py-3 px-3">NIS</th>
                  <th className="text-center py-3 px-3">Kelas</th>
                  <th className="text-center py-3 px-3">Total Poin</th>
                  <th className="text-center py-3 px-3">Jumlah</th>
                  <th className="text-left py-3 px-3">Tanggal Terlambat</th>
                </tr>
              </thead>
              <tbody>
                {lateStudents.map((student, index) => (
                  <tr 
                    key={student.id}
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => onStudentClick(student)}
                  >
                    <td className="py-3 px-3 font-medium">{index + 1}</td>
                    <td className="py-3 px-3 font-semibold">{student.full_name}</td>
                    <td className="text-center py-3 px-3">{student.nis}</td>
                    <td className="text-center py-3 px-3">
                      <Badge variant="outline">{student.classes?.name || '-'}</Badge>
                    </td>
                    <td className="text-center py-3 px-3">
                      <Badge variant="destructive" className="font-bold">
                        {student.latePoints} poin
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-3">
                      <Badge variant="secondary">
                        {student.lateCount}x
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground">
                      {student.lateDates?.slice(0, 5).map((date: string) => 
                        format(parseISO(date), 'dd/MM', { locale: localeId })
                      ).join(', ')}
                      {student.lateDates?.length > 5 && (
                        <span className="ml-1 text-orange-600">+{student.lateDates.length - 5} lainnya</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Late Students Chart */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-orange-600" />
            Grafik Siswa Terlambat ({getPeriodLabel()})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={lateStudents.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="full_name" 
                angle={-45}
                textAnchor="end"
                height={120}
                interval={0}
                tick={{ fontSize: 11 }}
              />
              <YAxis label={{ value: 'Poin Keterlambatan', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white p-3 border rounded-lg shadow-lg">
                        <p className="font-semibold text-sm">{data.full_name}</p>
                        <p className="text-xs text-muted-foreground">{data.nis} • {data.classes?.name || '-'}</p>
                        <div className="mt-2 space-y-1">
                          <p className="text-sm text-orange-600 font-bold">{data.latePoints} poin</p>
                          <p className="text-xs text-muted-foreground">{data.lateCount}x terlambat</p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <Bar 
                dataKey="latePoints" 
                fill="hsl(25, 95%, 53%)" 
                name="Poin Keterlambatan"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Late Violations Trend */}
      {lateViolationsTrend && lateViolationsTrend.length > 0 && (
        <Card className="border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-600" />
              Trend Keterlambatan ({getPeriodLabel()})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div className="p-3 border rounded-lg bg-orange-50">
                <p className="text-xs text-muted-foreground mb-1">Total Pelanggaran</p>
                <p className="text-2xl font-bold text-orange-600">
                  {lateViolationsTrend.reduce((sum, item) => sum + item.count, 0)}
                </p>
              </div>
              <div className="p-3 border rounded-lg bg-orange-50">
                <p className="text-xs text-muted-foreground mb-1">Total Poin</p>
                <p className="text-2xl font-bold text-orange-600">
                  {lateViolationsTrend.reduce((sum, item) => sum + item.points, 0)}
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={lateViolationsTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="period" 
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  yAxisId="left"
                  label={{ value: 'Jumlah Pelanggaran', angle: -90, position: 'insideLeft' }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  label={{ value: 'Total Poin', angle: 90, position: 'insideRight' }}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border rounded-lg shadow-lg">
                          <p className="font-semibold text-sm mb-2">{data.period}</p>
                          <div className="space-y-1">
                            <p className="text-xs">
                              <span className="text-orange-600 font-semibold">{data.count}</span> pelanggaran
                            </p>
                            <p className="text-xs">
                              <span className="text-red-600 font-semibold">{data.points}</span> poin total
                            </p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="count" 
                  stroke="hsl(25, 95%, 53%)" 
                  strokeWidth={2}
                  name="Jumlah Pelanggaran"
                  dot={{ fill: 'hsl(25, 95%, 53%)', r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="points" 
                  stroke="hsl(0, 84%, 60%)" 
                  strokeWidth={2}
                  name="Total Poin"
                  dot={{ fill: 'hsl(0, 84%, 60%)', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </>
  );
};
