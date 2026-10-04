import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, TrendingUp, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

interface DashboardAttendanceChartsProps {
  startDate: Date;
  endDate: Date;
  dailyAttendanceTrend: any[];
  attendanceByClass: any;
  lowAttendanceClasses: any[];
}

export const DashboardAttendanceCharts = ({
  startDate,
  endDate,
  dailyAttendanceTrend,
  attendanceByClass,
  lowAttendanceClasses,
}: DashboardAttendanceChartsProps) => {
  const chartData = dailyAttendanceTrend || [];
  const classData = attendanceByClass?.filledClasses || [];
  const unfilledClasses = attendanceByClass?.unfilledClasses || [];

  const COLORS = {
    hadir: '#10b981',
    izin: '#3b82f6',
    sakit: '#f59e0b',
    alpa: '#ef4444',
  };

  return (
    <div className="space-y-6">
      {/* Kelas Belum Mengisi Absensi */}
      {unfilledClasses.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              Kelas Belum Mengisi Absensi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertDescription className="text-sm text-amber-700 mb-3">
              Terdapat {unfilledClasses.length} kelas yang belum mengisi absensi untuk periode ini:
            </AlertDescription>
            <div className="flex flex-wrap gap-2">
              {unfilledClasses.map((cls: any) => (
                <span
                  key={cls.id}
                  className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium"
                >
                  {cls.name} ({cls.studentCount} siswa)
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grafik Kehadiran Harian */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tren Kehadiran Harian (Periode: {format(startDate, 'dd/MM/yyyy')} - {format(endDate, 'dd/MM/yyyy')})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="hadir" fill={COLORS.hadir} name="Hadir" />
                <Bar dataKey="izin" fill={COLORS.izin} name="Izin" />
                <Bar dataKey="sakit" fill={COLORS.sakit} name="Sakit" />
                <Bar dataKey="alpa" fill={COLORS.alpa} name="Alpa" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm">Belum ada data kehadiran untuk periode ini</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grafik Kehadiran Per Kelas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Grafik Kehadiran Per Kelas (Periode: {format(startDate, 'dd/MM/yyyy')} - {format(endDate, 'dd/MM/yyyy')})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {classData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={classData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} />
                <Tooltip />
                <Legend />
                <Bar dataKey="hadir" fill={COLORS.hadir} name="Hadir" />
                <Bar dataKey="izin" fill={COLORS.izin} name="Izin" />
                <Bar dataKey="sakit" fill={COLORS.sakit} name="Sakit" />
                <Bar dataKey="alpa" fill={COLORS.alpa} name="Alpa" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm">Belum ada data kehadiran per kelas untuk periode ini</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
