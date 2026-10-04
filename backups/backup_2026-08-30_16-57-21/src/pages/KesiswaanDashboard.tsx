import { useState, lazy, Suspense } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar as CalendarIcon, X, Users, AlertTriangle, Award, ClipboardList } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, eachMonthOfInterval, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useCountAnimation } from "@/hooks/useCountAnimation";
import { useStudentGenderStats } from "@/hooks/useStudentGenderStats";
import { StudentGenderStatsCard } from "@/components/dashboard/StudentGenderStatsCard";
import { useAcademicYear } from "@/contexts/AcademicYearContext";
import { useDateRangeFilter } from "@/hooks/useDateRangeFilter";
import { useDashboardExport } from "@/hooks/useDashboardExport";
import {
  useAttendanceRecap,
  useAttendanceByClass,
  useDailyAttendanceTrend,
  useLateStudents,
  useLateViolationsTrend,
  useStudentViolationDetails
} from "@/hooks/useDashboardData";
import { DashboardAttendanceRecap } from "@/components/dashboard/DashboardAttendanceRecap";
import { WaterLoaderCard } from "@/components/ui/water-progress-loader";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

// Lazy load 3D and heavy chart components
const FloatingShapes3D = lazy(() => import('@/components/3d/FloatingShapes').then(m => ({ default: m.FloatingShapes3D })));
const DashboardAttendanceCharts = lazy(() => import('@/components/dashboard/DashboardAttendanceCharts').then(m => ({ default: m.DashboardAttendanceCharts })));
const DashboardLateStudents = lazy(() => import('@/components/dashboard/DashboardLateStudents').then(m => ({ default: m.DashboardLateStudents })));
const StudentViolationModal = lazy(() => import('@/components/dashboard/StudentViolationModal').then(m => ({ default: m.StudentViolationModal })));

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6'];

export default function KesiswaanDashboard() {
  const { selectedYear, selectedSemester } = useAcademicYear();
  
  // State for student violation modal
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  // Use date range filter hook for attendance components
  const { startDate, endDate, setStartDate, setEndDate, setPeriod, getPeriodLabel } = useDateRangeFilter();
  
  // Additional date filter for violations/achievements stats
  const [statsStartDate, setStatsStartDate] = useState<Date | undefined>(startOfYear(new Date()));
  const [statsEndDate, setStatsEndDate] = useState<Date | undefined>(endOfMonth(new Date()));

  // Fetch attendance data using shared hooks
  const { data: attendanceRecap } = useAttendanceRecap(startDate, endDate, selectedYear, selectedSemester);
  const { data: attendanceByClass } = useAttendanceByClass(startDate, endDate, 'kesiswaan', selectedYear, selectedSemester);
  const { data: dailyAttendanceTrend } = useDailyAttendanceTrend(startDate, endDate, 'kesiswaan');
  const { data: lateStudents } = useLateStudents(startDate, endDate, 'kesiswaan');
  const { data: lateViolationsTrend } = useLateViolationsTrend(startDate, endDate, 'kesiswaan');
  const { data: studentViolationDetails } = useStudentViolationDetails(selectedStudent, startDate, endDate);

  const { handleExportPDF, handleExportExcel } = useDashboardExport(startDate, endDate, attendanceRecap);
  const { data: genderStats } = useStudentGenderStats(selectedYear, 'kesiswaan');

  const lowAttendanceClasses = attendanceByClass?.filledClasses?.filter(
    (classData: any) => classData.attendanceRate < 80 && classData.total > 0
  ) || [];

  const handleStudentClick = (student: any) => {
    setSelectedStudent(student);
    setIsDetailModalOpen(true);
  };

  // Fetch statistics with date filter for violations and achievements
  const { data: stats, isLoading } = useQuery({
    queryKey: ["kesiswaan-stats", statsStartDate?.toISOString(), statsEndDate?.toISOString()],
    queryFn: async () => {
      const startStr = statsStartDate ? format(statsStartDate, "yyyy-MM-dd") : undefined;
      const endStr = statsEndDate ? format(statsEndDate, "yyyy-MM-dd") : undefined;

      // Fetch students count
      const { count: studentCount } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("is_alumni", false);

      // Fetch violations
      let violationsQuery = supabase
        .from("student_violations")
        .select(`
          id, 
          violation_date, 
          points,
          violation_types:violation_type_id (name, category)
        `);
      
      if (startStr) violationsQuery = violationsQuery.gte("violation_date", startStr);
      if (endStr) violationsQuery = violationsQuery.lte("violation_date", endStr);
      
      const { data: violationsData, error: violationsError } = await violationsQuery;
      if (violationsError) throw violationsError;

      // Fetch achievements
      let achievementsQuery = supabase
        .from("student_achievements")
        .select("id, achievement_date, achievement_type, level");
      
      if (startStr) achievementsQuery = achievementsQuery.gte("achievement_date", startStr);
      if (endStr) achievementsQuery = achievementsQuery.lte("achievement_date", endStr);
      
      const { data: achievementsData, error: achievementsError } = await achievementsQuery;
      if (achievementsError) throw achievementsError;

      // Calculate violations stats
      const totalViolations = violationsData?.length || 0;
      const totalPoints = violationsData?.reduce((sum, v) => sum + (v.points || 0), 0) || 0;
      
      // Violation by category
      const violationsByCategory: Record<string, number> = {};
      violationsData?.forEach(v => {
        const category = (v.violation_types as any)?.category || 'lainnya';
        violationsByCategory[category] = (violationsByCategory[category] || 0) + 1;
      });

      // Calculate achievements stats
      const totalAchievements = achievementsData?.length || 0;
      
      // Achievements by type
      const achievementsByType: Record<string, number> = {};
      achievementsData?.forEach(a => {
        achievementsByType[a.achievement_type] = (achievementsByType[a.achievement_type] || 0) + 1;
      });

      // Achievements by level
      const achievementsByLevel: Record<string, number> = {};
      achievementsData?.forEach(a => {
        achievementsByLevel[a.level] = (achievementsByLevel[a.level] || 0) + 1;
      });

      // Fetch recent data
      const { data: recentViolations } = await supabase
        .from("student_violations")
        .select(`
          id, 
          violation_date, 
          points,
          notes,
          students:student_id (full_name, nis),
          violation_types:violation_type_id (name, category)
        `)
        .order("violation_date", { ascending: false })
        .limit(5);

      const { data: recentAchievements } = await supabase
        .from("student_achievements")
        .select(`
          id,
          achievement_date,
          achievement_name,
          achievement_type,
          level,
          students:student_id (full_name, nis)
        `)
        .order("achievement_date", { ascending: false })
        .limit(5);

      return {
        studentCount: studentCount || 0,
        totalViolations,
        totalPoints,
        violationsByCategory: Object.entries(violationsByCategory).map(([name, value]) => ({ name, value })),
        totalAchievements,
        achievementsByType: Object.entries(achievementsByType).map(([name, value]) => ({ name, value })),
        achievementsByLevel: Object.entries(achievementsByLevel).map(([name, value]) => ({ name, value })),
        recentViolations: recentViolations || [],
        recentAchievements: recentAchievements || [],
      };
    },
  });

  const clearStatsDateFilter = () => {
    setStatsStartDate(undefined);
    setStatsEndDate(undefined);
  };

  // Animated counts
  const animatedStudents = useCountAnimation(stats?.studentCount || 0);
  const animatedAttendance = useCountAnimation(attendanceRecap?.total ? Math.round((attendanceRecap.hadir / attendanceRecap.total) * 100) : 0);
  const animatedViolations = useCountAnimation(stats?.totalViolations || 0);
  const animatedAchievements = useCountAnimation(stats?.totalAchievements || 0);

  return (
    <ProtectedRoute allowedRoles={['kesiswaan', 'admin']}>
      <DashboardLayout>
        {/* 3D Background */}
        <Suspense fallback={null}>
          <div className="fixed inset-0 -z-10 opacity-50">
            <FloatingShapes3D />
          </div>
        </Suspense>
        
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dashboard Kesiswaan</h1>
              <p className="text-muted-foreground">Ringkasan data kesiswaan, absensi, dan pelanggaran</p>
            </div>
            
            {/* Date Filters for Stats (Violations/Achievements) */}
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !statsStartDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {statsStartDate ? format(statsStartDate, "dd MMM yyyy", { locale: idLocale }) : "Dari Tanggal"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={statsStartDate}
                    onSelect={setStatsStartDate}
                    initialFocus
                    locale={idLocale}
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !statsEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {statsEndDate ? format(statsEndDate, "dd MMM yyyy", { locale: idLocale }) : "Sampai Tanggal"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={statsEndDate}
                    onSelect={setStatsEndDate}
                    initialFocus
                    locale={idLocale}
                  />
                </PopoverContent>
              </Popover>

              {(statsStartDate || statsEndDate) && (
                <Button variant="ghost" size="icon" onClick={clearStatsDateFilter}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

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
                  {attendanceRecap?.hadir || 0} hadir dari {attendanceRecap?.total || 0} total
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pelanggaran</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{animatedViolations}</div>
                <p className="text-xs text-muted-foreground">
                  {stats?.totalPoints || 0} total poin
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Prestasi</CardTitle>
                <Award className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500">{animatedAchievements}</div>
                <p className="text-xs text-muted-foreground">penghargaan tercatat</p>
              </CardContent>
            </Card>
          </div>

          {/* Student Gender Stats */}
          {genderStats && (
            <StudentGenderStatsCard
              totalMale={genderStats.totalMale}
              totalFemale={genderStats.totalFemale}
              totalStudents={genderStats.totalStudents}
              byClass={genderStats.byClass}
              byGrade={genderStats.byGrade}
            />
          )}

          {/* Attendance Section - Same as Admin Dashboard */}
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
          
          <Suspense fallback={<WaterLoaderCard className="min-h-[400px]" />}>
            <DashboardAttendanceCharts
              startDate={startDate}
              endDate={endDate}
              dailyAttendanceTrend={dailyAttendanceTrend}
              attendanceByClass={attendanceByClass}
              lowAttendanceClasses={lowAttendanceClasses}
            />
          </Suspense>
          
          <Suspense fallback={<WaterLoaderCard className="min-h-[400px]" />}>
            <DashboardLateStudents
              lateStudents={lateStudents || []}
              lateViolationsTrend={lateViolationsTrend || []}
              getPeriodLabel={getPeriodLabel}
              onStudentClick={handleStudentClick}
            />
          </Suspense>

          {/* Violations & Achievements Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Violations by Category */}
            <Card>
              <CardHeader>
                <CardTitle>Pelanggaran per Kategori</CardTitle>
                <CardDescription>Distribusi jenis pelanggaran</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={stats?.violationsByCategory || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {(stats?.violationsByCategory || []).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Achievements by Type */}
            <Card>
              <CardHeader>
                <CardTitle>Prestasi per Jenis</CardTitle>
                <CardDescription>Distribusi jenis prestasi</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats?.achievementsByType || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="name" type="category" className="text-xs" width={100} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
                    <Bar dataKey="value" name="Jumlah" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Achievements by Level */}
          <Card>
            <CardHeader>
              <CardTitle>Prestasi per Tingkat</CardTitle>
              <CardDescription>Distribusi tingkat prestasi</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats?.achievementsByLevel || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="name" type="category" className="text-xs" width={100} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }} 
                  />
                  <Bar dataKey="value" name="Jumlah" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Recent Violations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Pelanggaran Terbaru
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(stats?.recentViolations || []).length === 0 ? (
                  <p className="text-muted-foreground text-sm">Tidak ada data pelanggaran</p>
                ) : (
                  stats?.recentViolations.map((violation: any) => (
                    <div key={violation.id} className="flex items-start justify-between p-3 rounded-lg bg-muted/50">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{violation.students?.full_name || '-'}</p>
                        <p className="text-xs text-muted-foreground">
                          {(violation.violation_types as any)?.name || '-'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {violation.violation_date ? format(new Date(violation.violation_date), "dd MMM yyyy", { locale: idLocale }) : '-'}
                        </p>
                      </div>
                      <Badge variant="destructive" className="text-xs">
                        {violation.points} poin
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Recent Achievements */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-500" />
                  Prestasi Terbaru
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(stats?.recentAchievements || []).length === 0 ? (
                  <p className="text-muted-foreground text-sm">Tidak ada data prestasi</p>
                ) : (
                  stats?.recentAchievements.map((achievement: any) => (
                    <div key={achievement.id} className="flex items-start justify-between p-3 rounded-lg bg-muted/50">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{achievement.students?.full_name || '-'}</p>
                        <p className="text-xs text-muted-foreground">{achievement.achievement_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {achievement.achievement_date ? format(new Date(achievement.achievement_date), "dd MMM yyyy", { locale: idLocale }) : '-'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <Badge variant="outline" className="text-xs">{achievement.achievement_type}</Badge>
                        <Badge variant="secondary" className="text-xs">{achievement.level}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Student Violation Modal */}
        <Suspense fallback={null}>
          <StudentViolationModal
            isOpen={isDetailModalOpen}
            onClose={() => setIsDetailModalOpen(false)}
            selectedStudent={selectedStudent}
            violationDetails={studentViolationDetails || []}
            getPeriodLabel={getPeriodLabel}
          />
        </Suspense>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
