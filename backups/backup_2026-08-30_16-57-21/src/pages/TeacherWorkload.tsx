import { DashboardLayout } from '@/components/DashboardLayout';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Clock, TrendingUp, AlertCircle, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface TeacherWorkload {
  teacherId: string;
  teacherName: string;
  totalHours: number;
  scheduleCount: number;
  dayBreakdown: { [key: string]: number };
  classCount: number;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const TeacherWorkload = () => {
  const { selectedYear, selectedSemester } = useAcademicYear();

  const { data: workloadData, isLoading } = useQuery({
    queryKey: ['teacher-workload', selectedYear, selectedSemester],
    queryFn: async () => {
      if (!selectedYear) return [];

      // Fetch all schedules for the selected year and semester
      let query = supabase
        .from('schedules')
        .select(`
          *,
          teachers(id, user_id),
          classes(id, name)
        `)
        .eq('academic_year', selectedYear);

      if (selectedSemester) {
        query = query.eq('semester', selectedSemester);
      }

      const { data: schedules, error } = await query;
      if (error) throw error;

      // Deduplicate identical schedules to avoid double-counting workload
      const rawSchedules = schedules ?? [];
      const uniqueScheduleMap = new Map<string, (typeof rawSchedules)[number]>();
      rawSchedules.forEach((schedule) => {
        const key = [
          schedule.teacher_id,
          schedule.class_id,
          schedule.day_of_week,
          schedule.start_time,
          schedule.end_time,
          (schedule.subject || '').trim(),
        ].join('|');

        if (!uniqueScheduleMap.has(key)) {
          uniqueScheduleMap.set(key, schedule);
        }
      });
      const dedupedSchedules = Array.from(uniqueScheduleMap.values());

      // Fetch teacher profiles
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name');
      if (profileError) throw profileError;

      // Calculate workload for each teacher
      const workloadMap = new Map<string, TeacherWorkload>();
      const teacherClassesMap = new Map<string, Set<string>>();

      dedupedSchedules.forEach((schedule) => {
        if (!schedule.teachers) return;

        const teacherId = schedule.teachers.id;
        const profile = profiles?.find((p) => p.id === schedule.teachers.user_id);
        const teacherName = profile?.full_name || 'Unknown';

        // Calculate hours
        const startTime = schedule.start_time.split(':');
        const endTime = schedule.end_time.split(':');
        const startMinutes = parseInt(startTime[0]) * 60 + parseInt(startTime[1]);
        const endMinutes = parseInt(endTime[0]) * 60 + parseInt(endTime[1]);
        const durationHours = (endMinutes - startMinutes) / 60;

        if (!workloadMap.has(teacherId)) {
          workloadMap.set(teacherId, {
            teacherId,
            teacherName,
            totalHours: 0,
            scheduleCount: 0,
            dayBreakdown: {},
            classCount: 0,
          });
          teacherClassesMap.set(teacherId, new Set());
        }

        const workload = workloadMap.get(teacherId)!;
        workload.totalHours += durationHours;
        workload.scheduleCount += 1;

        const dayName = DAYS[schedule.day_of_week - 1];
        workload.dayBreakdown[dayName] = (workload.dayBreakdown[dayName] || 0) + durationHours;

        // Track unique classes
        teacherClassesMap.get(teacherId)!.add(schedule.class_id);
      });

      // Set class counts after all schedules are processed
      teacherClassesMap.forEach((classes, teacherId) => {
        const workload = workloadMap.get(teacherId);
        if (workload) {
          workload.classCount = classes.size;
        }
      });

      return Array.from(workloadMap.values()).sort((a, b) => b.totalHours - a.totalHours);
    },
  });

  const getWorkloadStatus = (hours: number) => {
    if (hours >= 30) return { label: 'Overload', variant: 'destructive' as const };
    if (hours >= 24) return { label: 'Tinggi', variant: 'default' as const };
    if (hours >= 18) return { label: 'Normal', variant: 'secondary' as const };
    return { label: 'Rendah', variant: 'outline' as const };
  };

  const averageHours = workloadData?.length
    ? workloadData.reduce((sum, t) => sum + t.totalHours, 0) / workloadData.length
    : 0;

  const maxHours = workloadData?.length
    ? Math.max(...workloadData.map((t) => t.totalHours))
    : 0;

  const minHours = workloadData?.length
    ? Math.min(...workloadData.map((t) => t.totalHours))
    : 0;

  // Prepare data for bar chart
  const barChartData = workloadData?.map((teacher) => ({
    name: teacher.teacherName.split(' ').slice(0, 2).join(' '), // Shorten name
    hours: parseFloat(teacher.totalHours.toFixed(1)),
  })) || [];

  // Prepare data for pie chart (by status)
  const pieChartData = [
    {
      name: 'Rendah (<18 jam)',
      value: workloadData?.filter((t) => t.totalHours < 18).length || 0,
      fill: 'hsl(var(--muted))',
    },
    {
      name: 'Normal (18-23 jam)',
      value: workloadData?.filter((t) => t.totalHours >= 18 && t.totalHours < 24).length || 0,
      fill: 'hsl(var(--primary))',
    },
    {
      name: 'Tinggi (24-29 jam)',
      value: workloadData?.filter((t) => t.totalHours >= 24 && t.totalHours < 30).length || 0,
      fill: 'hsl(var(--accent))',
    },
    {
      name: 'Overload (≥30 jam)',
      value: workloadData?.filter((t) => t.totalHours >= 30).length || 0,
      fill: 'hsl(var(--destructive))',
    },
  ].filter((item) => item.value > 0);

  const chartConfig = {
    hours: {
      label: 'Jam Mengajar',
      color: 'hsl(var(--primary))',
    },
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analisis Beban Mengajar</h1>
          <p className="text-muted-foreground">
            Distribusi jam mengajar per guru untuk tahun ajaran {selectedYear}
            {selectedSemester && ` - Semester ${selectedSemester}`}
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rata-rata Jam/Minggu</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{averageHours.toFixed(1)} jam</div>
              <p className="text-xs text-muted-foreground">
                Per guru per minggu
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Beban Tertinggi</CardTitle>
              <TrendingUp className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{maxHours.toFixed(1)} jam</div>
              <p className="text-xs text-muted-foreground">
                {workloadData?.find((t) => t.totalHours === maxHours)?.teacherName}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Beban Terendah</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{minHours.toFixed(1)} jam</div>
              <p className="text-xs text-muted-foreground">
                {workloadData?.find((t) => t.totalHours === minHours)?.teacherName}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Alert for overloaded teachers */}
        {workloadData?.some((t) => t.totalHours >= 30) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Ada {workloadData.filter((t) => t.totalHours >= 30).length} guru dengan beban mengajar
              ≥30 jam/minggu. Pertimbangkan untuk menyeimbangkan distribusi jadwal.
            </AlertDescription>
          </Alert>
        )}

        {/* Visualizations */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Distribusi Jam Mengajar per Guru</CardTitle>
              <CardDescription>Total jam mengajar mingguan setiap guru</CardDescription>
            </CardHeader>
            <CardContent>
              {barChartData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        className="text-xs"
                      />
                      <YAxis
                        label={{ value: 'Jam/Minggu', angle: -90, position: 'insideLeft' }}
                        className="text-xs"
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  Tidak ada data untuk ditampilkan
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Distribusi Status Beban Mengajar</CardTitle>
              <CardDescription>Jumlah guru berdasarkan kategori beban mengajar</CardDescription>
            </CardHeader>
            <CardContent>
              {pieChartData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={120}
                        fill="hsl(var(--primary))"
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  Tidak ada data untuk ditampilkan
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Workload Table */}
        <Card>
          <CardHeader>
            <CardTitle>Distribusi Jam Mengajar</CardTitle>
            <CardDescription>
              Rincian jam mengajar per guru dan breakdown per hari
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Nama Guru</TableHead>
                    <TableHead className="text-center">Total Jam/Minggu</TableHead>
                    <TableHead className="text-center">Jumlah Jadwal</TableHead>
                    <TableHead className="text-center">Jumlah Kelas</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Breakdown per Hari</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workloadData && workloadData.length > 0 ? (
                    workloadData.map((teacher, index) => {
                      const status = getWorkloadStatus(teacher.totalHours);
                      return (
                        <TableRow key={teacher.teacherId}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">{teacher.teacherName}</TableCell>
                          <TableCell className="text-center font-semibold">
                            {teacher.totalHours.toFixed(1)} jam
                          </TableCell>
                          <TableCell className="text-center">{teacher.scheduleCount}</TableCell>
                          <TableCell className="text-center">{teacher.classCount}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs">
                              {DAYS.map((day) => {
                                const hours = teacher.dayBreakdown[day] || 0;
                                if (hours === 0) return null;
                                return (
                                  <div key={day} className="flex justify-between gap-2">
                                    <span className="text-muted-foreground">{day}:</span>
                                    <span className="font-medium">{hours.toFixed(1)} jam</span>
                                  </div>
                                );
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Tidak ada data beban mengajar
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kategori Beban Mengajar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Rendah</Badge>
                <span className="text-muted-foreground">&lt; 18 jam/minggu</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Normal</Badge>
                <span className="text-muted-foreground">18-23 jam/minggu</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default">Tinggi</Badge>
                <span className="text-muted-foreground">24-29 jam/minggu</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">Overload</Badge>
                <span className="text-muted-foreground">≥30 jam/minggu</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TeacherWorkload;
