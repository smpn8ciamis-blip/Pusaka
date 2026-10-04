import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ClipboardList, Users, FileText, Clock, TrendingUp } from 'lucide-react';
import { useCountAnimation } from '@/hooks/useCountAnimation';
import { useDateRangeFilter } from '@/hooks/useDateRangeFilter';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { useAttendanceRecap } from '@/hooks/useDashboardData';
import { DashboardAttendanceRecap } from '@/components/dashboard/DashboardAttendanceRecap';
import { DashboardWelcomeBanner } from '@/components/dashboard/DashboardWelcomeBanner';
import { useUserProfile } from '@/hooks/useDashboardData';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#ec4899'];

export default function GuruPiketDashboard() {
  const { user, userRole } = useAuth();
  const { selectedYear, selectedSemester } = useAcademicYear();
  const { startDate, endDate, setStartDate, setEndDate, setPeriod, getPeriodLabel } = useDateRangeFilter();
  
  const { data: profile } = useUserProfile(user?.id);
  const { data: attendanceRecap } = useAttendanceRecap(startDate, endDate, selectedYear, selectedSemester);
  const { handleExportPDF, handleExportExcel } = useDashboardExport(startDate, endDate, attendanceRecap);

  // Fetch dispensation stats
  const { data: dispensasiStats } = useQuery({
    queryKey: ['dispensasi-stats', startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      const startStr = startDate ? format(startDate, 'yyyy-MM-dd') : format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const endStr = endDate ? format(endDate, 'yyyy-MM-dd') : format(endOfMonth(new Date()), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('student_dispensations')
        .select('id, reason_category, status, dispensation_date')
        .gte('dispensation_date', startStr)
        .lte('dispensation_date', endStr);

      if (error) throw error;

      const total = data?.length || 0;
      const byCategory: Record<string, number> = {};
      data?.forEach(d => {
        const cat = d.reason_category || 'lainnya';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      });

      return {
        total,
        byCategory: Object.entries(byCategory).map(([name, value]) => ({ name, value })),
      };
    },
  });

  // Fetch today's dispensations
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: todayDispensations } = useQuery({
    queryKey: ['dispensasi-today', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_dispensations')
        .select(`
          id, reason, reason_category, start_time, end_time, status,
          students:student_id (full_name, nis)
        `)
        .eq('dispensation_date', today)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch total active students
  const { data: studentCount } = useQuery({
    queryKey: ['active-students-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('is_alumni', false)
        .eq('status', 'aktif');
      if (error) throw error;
      return count || 0;
    },
  });

  const animatedStudents = useCountAnimation(studentCount || 0);
  const animatedDispensasi = useCountAnimation(dispensasiStats?.total || 0);
  const animatedAttendance = useCountAnimation(
    attendanceRecap?.total ? Math.round((attendanceRecap.hadir / attendanceRecap.total) * 100) : 0
  );

  return (
    <ProtectedRoute allowedRoles={['guru_piket', 'admin']}>
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <DashboardWelcomeBanner profile={profile} userRole={userRole} />

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Siswa Aktif</CardTitle>
                <Users className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500">{animatedStudents}</div>
                <p className="text-xs text-muted-foreground">siswa terdaftar</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tingkat Kehadiran</CardTitle>
                <ClipboardList className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{animatedAttendance}%</div>
                <p className="text-xs text-muted-foreground">
                  {attendanceRecap?.hadir || 0} hadir dari {attendanceRecap?.total || 0}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Dispensasi</CardTitle>
                <FileText className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500">{animatedDispensasi}</div>
                <p className="text-xs text-muted-foreground">periode ini</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Dispensasi Hari Ini</CardTitle>
                <Clock className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-500">{todayDispensations?.length || 0}</div>
                <p className="text-xs text-muted-foreground">siswa dispensasi</p>
              </CardContent>
            </Card>
          </div>

          {/* Attendance Recap */}
          <DashboardAttendanceRecap
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            setPeriod={setPeriod}
            attendanceRecap={attendanceRecap}
            onExportPDF={handleExportPDF}
            onExportExcel={handleExportExcel}
          />

          <div className="grid gap-6 md:grid-cols-2">
            {/* Dispensation by Category Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Dispensasi per Kategori</CardTitle>
                <CardDescription>Distribusi alasan dispensasi</CardDescription>
              </CardHeader>
              <CardContent>
                {dispensasiStats?.byCategory && dispensasiStats.byCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={dispensasiStats.byCategory}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {dispensasiStats.byCategory.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                    Belum ada data dispensasi
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Today's Dispensations */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Dispensasi Hari Ini</CardTitle>
                  <CardDescription>Siswa yang mendapat dispensasi hari ini</CardDescription>
                </div>
                <Link to="/dispensasi-siswa">
                  <Button variant="outline" size="sm">Lihat Semua</Button>
                </Link>
              </CardHeader>
              <CardContent>
                {todayDispensations && todayDispensations.length > 0 ? (
                  <div className="space-y-3">
                    {todayDispensations.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium text-sm">{(d.students as any)?.full_name}</p>
                          <p className="text-xs text-muted-foreground">{d.reason}</p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 font-medium capitalize">
                          {d.reason_category}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                    Tidak ada dispensasi hari ini
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
