import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Activity, AlertTriangle, AlertCircle } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface DashboardAttendanceChartsProps {
  startDate: Date;
  endDate: Date;
  dailyAttendanceTrend: any;
  attendanceByClass: { filledClasses: any[]; unfilledClasses: any[] } | null;
  lowAttendanceClasses: any[];
}

export const DashboardAttendanceCharts = ({
  startDate,
  endDate,
  dailyAttendanceTrend,
  attendanceByClass,
  lowAttendanceClasses
}: DashboardAttendanceChartsProps) => {
  const filledClasses = attendanceByClass?.filledClasses || [];
  const unfilledClasses = attendanceByClass?.unfilledClasses || [];

  return (
    <>
      {/* Daily Attendance Trend */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tren Kehadiran Harian (Periode: {format(startDate, 'dd/MM/yyyy')} - {format(endDate, 'dd/MM/yyyy')})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyAttendanceTrend && dailyAttendanceTrend.length > 0 ? (
            <div className="overflow-x-auto">
              <ResponsiveContainer width="100%" height={350} minWidth={300}>
                <LineChart data={dailyAttendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="hadir" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="Hadir" dot={{ fill: 'hsl(142, 76%, 36%)', r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="izin" stroke="hsl(47, 96%, 53%)" strokeWidth={2} name="Izin" dot={{ fill: 'hsl(47, 96%, 53%)', r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="sakit" stroke="hsl(25, 95%, 53%)" strokeWidth={2} name="Sakit" dot={{ fill: 'hsl(25, 95%, 53%)', r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="alpa" stroke="hsl(0, 84%, 60%)" strokeWidth={2} name="Alpa" dot={{ fill: 'hsl(0, 84%, 60%)', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Belum ada data kehadiran untuk periode ini</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Low Attendance Alert */}
      {lowAttendanceClasses.length > 0 && (
        <Alert variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-950">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="font-bold text-lg">Peringatan: Tingkat Kehadiran Rendah!</AlertTitle>
          <AlertDescription>
            <p className="mb-3">Terdapat {lowAttendanceClasses.length} kelas dengan tingkat kehadiran di bawah 80%:</p>
            <div className="space-y-2">
              {lowAttendanceClasses.map((classData, index) => (
                <div key={index} className="flex items-center justify-between bg-white dark:bg-red-900 p-3 rounded-md border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-3">
                    <Badge variant="destructive" className="text-sm font-bold">
                      {classData.attendanceRate}%
                    </Badge>
                    <span className="font-semibold">{classData.name}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {classData.hadir} dari {classData.total} kehadiran
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm">
              <strong>Rekomendasi:</strong> Lakukan pengecekan dan tindak lanjut untuk meningkatkan kehadiran siswa di kelas tersebut.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Unfilled Classes Alert */}
      {unfilledClasses.length > 0 && (
        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-bold text-lg text-amber-800 dark:text-amber-200">Kelas Belum Mengisi Absensi</AlertTitle>
          <AlertDescription>
            <p className="mb-3 text-amber-700 dark:text-amber-300">
              Terdapat {unfilledClasses.length} kelas yang belum mengisi absensi untuk periode ini:
            </p>
            <div className="flex flex-wrap gap-2">
              {unfilledClasses.map((classData, index) => (
                <Badge 
                  key={index} 
                  variant="outline" 
                  className="border-amber-500 text-amber-700 dark:text-amber-300 bg-white dark:bg-amber-900"
                >
                  {classData.name} ({classData.studentCount} siswa){classData.homeroomTeacherName && ` - ${classData.homeroomTeacherName}`}
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Attendance By Class */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Grafik Kehadiran Per Kelas (Periode: {format(startDate, 'dd/MM/yyyy')} - {format(endDate, 'dd/MM/yyyy')})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filledClasses.length > 0 ? (
            <>
              <div className="mb-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-3 px-3 font-semibold">Kelas</th>
                      <th className="text-center py-3 px-3 font-semibold">Siswa</th>
                      <th className="text-center py-3 px-3 font-semibold">Hadir</th>
                      <th className="text-center py-3 px-3 font-semibold">Izin</th>
                      <th className="text-center py-3 px-3 font-semibold">Sakit</th>
                      <th className="text-center py-3 px-3 font-semibold">Alpa</th>
                      <th className="text-center py-3 px-3 font-semibold">Total</th>
                      <th className="text-center py-3 px-3 font-semibold">Persentase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filledClasses.map((classData: any, index: number) => (
                      <tr key={index} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-2 px-3 font-medium">{classData.name}</td>
                        <td className="text-center py-2 px-3 text-muted-foreground">{classData.studentCount}</td>
                        <td className="text-center py-2 px-3">
                          <span className="text-green-600 font-medium">{classData.hadir}</span>
                        </td>
                        <td className="text-center py-2 px-3">
                          <span className="text-yellow-600 font-medium">{classData.izin}</span>
                        </td>
                        <td className="text-center py-2 px-3">
                          <span className="text-orange-600 font-medium">{classData.sakit}</span>
                        </td>
                        <td className="text-center py-2 px-3">
                          <span className="text-red-600 font-medium">{classData.alpa}</span>
                        </td>
                        <td className="text-center py-2 px-3 font-medium">{classData.total}</td>
                        <td className="text-center py-2 px-3">
                          <Badge 
                            variant={classData.attendanceRate >= 80 ? 'default' : 'destructive'}
                            className="font-semibold"
                          >
                            {classData.attendanceRate}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto">
                <ResponsiveContainer width="100%" height={400} minWidth={300}>
                  <BarChart data={filledClasses}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      interval={0}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="hadir" fill="hsl(142, 76%, 36%)" name="Hadir" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="izin" fill="hsl(47, 96%, 53%)" name="Izin" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sakit" fill="hsl(25, 95%, 53%)" name="Sakit" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="alpa" fill="hsl(0, 84%, 60%)" name="Alpa" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Belum ada data kehadiran per kelas untuk periode ini</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};
