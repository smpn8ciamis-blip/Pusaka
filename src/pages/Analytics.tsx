import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Calendar, Users, BarChart3, UserCheck, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval, eachMonthOfInterval, parseISO, isWithinInterval } from 'date-fns';
import { id } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

const Analytics = () => {
  const { userRole, user } = useAuth();
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState('all');
  const currentYear = new Date().getFullYear();
  const [selectedYear] = useState(currentYear.toString());
  const [sortField, setSortField] = useState<'name' | 'hadir' | 'sakit' | 'izin' | 'alpa' | 'total' | 'violationPoints'>('violationPoints');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('classes').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: students } = useQuery({
    queryKey: ['students', selectedClass],
    queryFn: async () => {
      let query = supabase.from('students').select('*').order('full_name');
      
      if (selectedClass !== 'all') {
        query = query.eq('class_id', selectedClass);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: attendanceRecords } = useQuery({
    queryKey: ['analytics-attendance', selectedYear, selectedClass, selectedStudent, userRole, user?.id],
    queryFn: async () => {
      // Get teacher's schedule IDs if user is a teacher
      let scheduleIds: string[] = [];
      if (userRole === 'teacher') {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();
        
        if (!teacher) return [];
        
        const { data: teacherSchedules } = await supabase
          .from('schedules')
          .select('id')
          .eq('teacher_id', teacher.id);
        
        scheduleIds = teacherSchedules?.map(s => s.id) || [];
        if (scheduleIds.length === 0) return [];
      }

      let query = supabase
        .from('attendance')
        .select(`
          *,
          students (
            id,
            full_name,
            class_id
          )
        `)
        .gte('date', `${selectedYear}-01-01`)
        .lte('date', `${selectedYear}-12-31`);

      // Filter by teacher's schedules if user is a teacher
      if (userRole === 'teacher' && scheduleIds.length > 0) {
        query = query.or(`schedule_id.in.(${scheduleIds.join(',')}),and(schedule_id.is.null,sched_teacher_id.eq.${user?.id})`);
      }

      if (selectedClass !== 'all') {
        query = query.eq('students.class_id', selectedClass);
      }

      if (selectedStudent !== 'all') {
        query = query.eq('student_id', selectedStudent);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!userRole && (userRole === 'admin' || !!user?.id),
  });

  // Deduplicate attendance records by student and date
  const deduplicatedRecords = useMemo(() => {
    if (!attendanceRecords) return [];
    
    const recordMap = new Map<string, any>();
    
    const sortedRecords = [...attendanceRecords].sort((a, b) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
    
    sortedRecords.forEach(record => {
      const key = `${record.student_id}-${record.date}`;
      if (!recordMap.has(key)) {
        recordMap.set(key, record);
      }
    });
    
    return Array.from(recordMap.values());
  }, [attendanceRecords]);

  // Calculate trend data based on period type
  const trendData = useMemo(() => {
    if (!deduplicatedRecords || deduplicatedRecords.length === 0) return [];

    const startDate = new Date(`${selectedYear}-01-01`);
    const endDate = new Date(`${selectedYear}-12-31`);

    let periods: Date[] = [];
    
    if (periodType === 'weekly') {
      periods = eachWeekOfInterval({ start: startDate, end: endDate }, { locale: id });
    } else {
      periods = eachMonthOfInterval({ start: startDate, end: endDate });
    }

    return periods.map(periodStart => {
      const periodEnd = periodType === 'weekly' 
        ? endOfWeek(periodStart, { locale: id })
        : endOfMonth(periodStart);

      const periodRecords = deduplicatedRecords.filter(record => {
        const recordDate = parseISO(record.date);
        return isWithinInterval(recordDate, { start: periodStart, end: periodEnd });
      });

      const hadir = periodRecords.filter(r => r.status === 'hadir').length;
      const sakit = periodRecords.filter(r => r.status === 'sakit').length;
      const izin = periodRecords.filter(r => r.status === 'izin').length;
      const alpa = periodRecords.filter(r => r.status === 'alpa').length;

      return {
        period: periodType === 'weekly' 
          ? `Minggu ${format(periodStart, 'dd MMM', { locale: id })}`
          : format(periodStart, 'MMMM', { locale: id }),
        Hadir: hadir,
        Sakit: sakit,
        Izin: izin,
        Alpa: alpa,
        total: hadir + sakit + izin + alpa,
      };
    }).filter(data => data.total > 0); // Only show periods with data
  }, [deduplicatedRecords, periodType, selectedYear]);

  // Calculate overall statistics
  const overallStats = useMemo(() => {
    if (!deduplicatedRecords) return { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
    
    const hadir = deduplicatedRecords.filter(r => r.status === 'hadir').length;
    const sakit = deduplicatedRecords.filter(r => r.status === 'sakit').length;
    const izin = deduplicatedRecords.filter(r => r.status === 'izin').length;
    const alpa = deduplicatedRecords.filter(r => r.status === 'alpa').length;
    
    return {
      hadir,
      sakit,
      izin,
      alpa,
      total: hadir + sakit + izin + alpa,
      hadirPercentage: hadir > 0 ? ((hadir / (hadir + sakit + izin + alpa)) * 100).toFixed(1) : 0,
    };
  }, [deduplicatedRecords]);

  // Calculate per-student statistics
  const studentStats = useMemo(() => {
    if (!deduplicatedRecords || !students) return [];
    
    const statsMap = new Map<string, {
      studentId: string;
      studentName: string;
      hadir: number;
      sakit: number;
      izin: number;
      alpa: number;
      total: number;
      violationPoints: number;
    }>();

    // Initialize all students
    students.forEach(student => {
      if (selectedStudent === 'all' || selectedStudent === student.id) {
        statsMap.set(student.id, {
          studentId: student.id,
          studentName: student.full_name,
          hadir: 0,
          sakit: 0,
          izin: 0,
          alpa: 0,
          total: 0,
          violationPoints: 0,
        });
      }
    });

    // Count attendance per student (per date, already deduplicated)
    deduplicatedRecords.forEach(record => {
      const stats = statsMap.get(record.student_id);
      if (stats) {
        stats.total += 1;
        
        if (record.status === 'hadir') stats.hadir += 1;
        else if (record.status === 'sakit') stats.sakit += 1;
        else if (record.status === 'izin') stats.izin += 1;
        else if (record.status === 'alpa') {
          stats.alpa += 1;
          stats.violationPoints += 5; // 5 points per alpa
        }
      }
    });

    const filtered = Array.from(statsMap.values()).filter(stat => stat.total > 0);
    
    // Apply sorting
    return filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.studentName.localeCompare(b.studentName);
          break;
        case 'hadir':
          comparison = a.hadir - b.hadir;
          break;
        case 'sakit':
          comparison = a.sakit - b.sakit;
          break;
        case 'izin':
          comparison = a.izin - b.izin;
          break;
        case 'alpa':
          comparison = a.alpa - b.alpa;
          break;
        case 'total':
          comparison = a.total - b.total;
          break;
        case 'violationPoints':
          comparison = a.violationPoints - b.violationPoints;
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [deduplicatedRecords, students, selectedStudent, sortField, sortDirection]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">Analytics Kehadiran</h1>
            <p className="text-muted-foreground">Tren dan statistik kehadiran siswa</p>
          </div>
          <TrendingUp className="h-8 w-8 text-primary" />
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Filter Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Periode</label>
                <Select value={periodType} onValueChange={(value: 'weekly' | 'monthly') => setPeriodType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Per Minggu</SelectItem>
                    <SelectItem value="monthly">Per Bulan</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Kelas</label>
                <Select value={selectedClass} onValueChange={(value) => {
                  setSelectedClass(value);
                  setSelectedStudent('all');
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kelas</SelectItem>
                    {classes?.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Siswa</label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Siswa</SelectItem>
                    {students?.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tahun</label>
                <Select value={selectedYear} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={selectedYear}>{selectedYear}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Rekap</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Hadir</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{overallStats.hadir}</div>
              <p className="text-xs text-muted-foreground">{overallStats.hadirPercentage}% kehadiran</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sakit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{overallStats.sakit}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Izin</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{overallStats.izin}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Alpa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{overallStats.alpa}</div>
            </CardContent>
          </Card>
        </div>

        {/* Trend Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Tren Kehadiran {periodType === 'weekly' ? 'Per Minggu' : 'Per Bulan'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <ResponsiveContainer width="100%" height={400} minWidth={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="period" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Hadir" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="Sakit" stroke="#f59e0b" strokeWidth={2} />
                  <Line type="monotone" dataKey="Izin" stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey="Alpa" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Per-Student Statistics Table */}
        {studentStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Statistik Per Siswa (Per Tanggal)
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Perhitungan absensi per tanggal untuk menghitung poin pelanggaran. Alpa = 5 poin pelanggaran.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">No</TableHead>
                      <TableHead>
                        <button 
                          onClick={() => handleSort('name')}
                          className="flex items-center hover:text-foreground transition-colors"
                        >
                          Nama Siswa
                          <SortIcon field="name" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">
                        <button 
                          onClick={() => handleSort('hadir')}
                          className="flex items-center justify-center mx-auto hover:text-foreground transition-colors"
                        >
                          Hadir
                          <SortIcon field="hadir" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">
                        <button 
                          onClick={() => handleSort('sakit')}
                          className="flex items-center justify-center mx-auto hover:text-foreground transition-colors"
                        >
                          Sakit
                          <SortIcon field="sakit" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">
                        <button 
                          onClick={() => handleSort('izin')}
                          className="flex items-center justify-center mx-auto hover:text-foreground transition-colors"
                        >
                          Izin
                          <SortIcon field="izin" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">
                        <button 
                          onClick={() => handleSort('alpa')}
                          className="flex items-center justify-center mx-auto hover:text-foreground transition-colors"
                        >
                          Alpa
                          <SortIcon field="alpa" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">
                        <button 
                          onClick={() => handleSort('total')}
                          className="flex items-center justify-center mx-auto hover:text-foreground transition-colors"
                        >
                          Total Hari
                          <SortIcon field="total" />
                        </button>
                      </TableHead>
                      <TableHead className="text-center">
                        <button 
                          onClick={() => handleSort('violationPoints')}
                          className="flex items-center justify-center mx-auto hover:text-foreground transition-colors"
                        >
                          Poin Pelanggaran
                          <SortIcon field="violationPoints" />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentStats.map((stat, index) => (
                      <TableRow key={stat.studentId}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>{stat.studentName}</TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700 font-semibold">
                            {stat.hadir}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-semibold">
                            {stat.sakit}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold">
                            {stat.izin}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700 font-semibold">
                            {stat.alpa}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{stat.total}</TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full font-bold ${
                            stat.violationPoints >= 20 ? 'bg-red-100 text-red-700' :
                            stat.violationPoints >= 10 ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {stat.violationPoints}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Additional Insights */}
        {trendData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Insight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Periode dengan kehadiran tertinggi:</strong>{' '}
                  {trendData.reduce((max, curr) => curr.Hadir > max.Hadir ? curr : max, trendData[0])?.period || '-'} dengan{' '}
                  {Math.max(...trendData.map(d => d.Hadir))} siswa hadir
                </p>
                <p>
                  <strong>Rata-rata kehadiran per periode:</strong>{' '}
                  {(trendData.reduce((sum, curr) => sum + curr.Hadir, 0) / trendData.length).toFixed(1)} siswa
                </p>
                <p>
                  <strong>Total periode dengan data:</strong> {trendData.length} periode
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {trendData.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Tidak ada data kehadiran untuk filter yang dipilih</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Analytics;
