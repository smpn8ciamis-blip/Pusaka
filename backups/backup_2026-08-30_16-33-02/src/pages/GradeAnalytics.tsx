import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Award, BarChart3, GraduationCap } from 'lucide-react';
import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';

const GradeAnalytics = () => {
  const { userRole, user } = useAuth();
  const { selectedYear } = useAcademicYear();
  const [selectedClass, setSelectedClass] = useState('all');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');

  const { data: classes } = useQuery({
    queryKey: ['classes', selectedYear],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('academic_year', selectedYear)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: grades } = useQuery({
    queryKey: ['analytics-grades', selectedYear, selectedClass, userRole, user?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      
      let schedulesQuery = supabase
        .from('schedules')
        .select('id, subject, class_id, academic_year, teacher_id, classes(name, grade)')
        .eq('academic_year', selectedYear);

      // Filter by teacher if user is a teacher
      if (userRole === 'teacher') {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();
        
        if (!teacher) return [];
        schedulesQuery = schedulesQuery.eq('teacher_id', teacher.id);
      }

      const { data: schedules, error: schedulesError } = await schedulesQuery;
      if (schedulesError) throw schedulesError;

      const scheduleIds = schedules?.map(s => s.id) || [];
      if (scheduleIds.length === 0) return [];

      let gradesQuery = supabase
        .from('grades')
        .select(`
          *,
          schedule_id,
          students (
            id,
            full_name,
            class_id
          )
        `)
        .in('schedule_id', scheduleIds);

      const { data, error } = await gradesQuery;
      if (error) throw error;

      // Attach schedule info to each grade
      return data?.map(grade => {
        const schedule = schedules?.find(s => s.id === grade.schedule_id);
        return {
          ...grade,
          subject: schedule?.subject,
          class_name: schedule?.classes?.name,
          class_grade: schedule?.classes?.grade,
        };
      }) || [];
    },
    enabled: !!user?.id && !!userRole,
  });

  // Filter grades by selected class
  const filteredGrades = useMemo(() => {
    if (!grades) return [];
    if (selectedClass === 'all') return grades;
    return grades.filter(g => g.students?.class_id === selectedClass);
  }, [grades, selectedClass]);

  // Calculate average grades per subject
  const averageBySubject = useMemo(() => {
    if (!filteredGrades || filteredGrades.length === 0) return [];

    const subjectGroups = filteredGrades.reduce((acc, grade) => {
      const subject = grade.subject || 'Unknown';
      if (!acc[subject]) {
        acc[subject] = {
          tugas: [],
          kuis: [],
          uts: [],
          uas: [],
          praktik: [],
          final: [],
        };
      }
      
      acc[subject].tugas.push(Number(grade.tugas) || 0);
      acc[subject].kuis.push(Number(grade.kuis) || 0);
      acc[subject].uts.push(Number(grade.uts) || 0);
      acc[subject].uas.push(Number(grade.uas) || 0);
      acc[subject].praktik.push(Number(grade.praktik) || 0);
      acc[subject].final.push(Number(grade.final_grade) || 0);
      
      return acc;
    }, {} as Record<string, any>);

    return Object.entries(subjectGroups).map(([subject, values]) => ({
      subject,
      'Rata-rata Tugas': (values.tugas.reduce((a: number, b: number) => a + b, 0) / values.tugas.length).toFixed(1),
      'Rata-rata Kuis': (values.kuis.reduce((a: number, b: number) => a + b, 0) / values.kuis.length).toFixed(1),
      'Rata-rata UTS': (values.uts.reduce((a: number, b: number) => a + b, 0) / values.uts.length).toFixed(1),
      'Rata-rata UAS': (values.uas.reduce((a: number, b: number) => a + b, 0) / values.uas.length).toFixed(1),
      'Rata-rata Praktik': (values.praktik.reduce((a: number, b: number) => a + b, 0) / values.praktik.length).toFixed(1),
      'Nilai Akhir': (values.final.reduce((a: number, b: number) => a + b, 0) / values.final.length).toFixed(1),
    }));
  }, [filteredGrades]);

  // Calculate average grades per class
  const averageByClass = useMemo(() => {
    if (!grades || grades.length === 0) return [];

    const classGroups = grades.reduce((acc, grade) => {
      const className = grade.class_name || 'Unknown';
      if (!acc[className]) {
        acc[className] = {
          tugas: [],
          kuis: [],
          uts: [],
          uas: [],
          praktik: [],
          final: [],
        };
      }
      
      acc[className].tugas.push(Number(grade.tugas) || 0);
      acc[className].kuis.push(Number(grade.kuis) || 0);
      acc[className].uts.push(Number(grade.uts) || 0);
      acc[className].uas.push(Number(grade.uas) || 0);
      acc[className].praktik.push(Number(grade.praktik) || 0);
      acc[className].final.push(Number(grade.final_grade) || 0);
      
      return acc;
    }, {} as Record<string, any>);

    return Object.entries(classGroups).map(([className, values]) => ({
      class: className,
      'Rata-rata Tugas': (values.tugas.reduce((a: number, b: number) => a + b, 0) / values.tugas.length).toFixed(1),
      'Rata-rata Kuis': (values.kuis.reduce((a: number, b: number) => a + b, 0) / values.kuis.length).toFixed(1),
      'Rata-rata UTS': (values.uts.reduce((a: number, b: number) => a + b, 0) / values.uts.length).toFixed(1),
      'Rata-rata UAS': (values.uas.reduce((a: number, b: number) => a + b, 0) / values.uas.length).toFixed(1),
      'Rata-rata Praktik': (values.praktik.reduce((a: number, b: number) => a + b, 0) / values.praktik.length).toFixed(1),
      'Nilai Akhir': (values.final.reduce((a: number, b: number) => a + b, 0) / values.final.length).toFixed(1),
    })).sort((a, b) => a.class.localeCompare(b.class));
  }, [grades]);

  // Calculate overall statistics
  const overallStats = useMemo(() => {
    if (!filteredGrades || filteredGrades.length === 0) {
      return {
        avgTugas: 0,
        avgKuis: 0,
        avgUTS: 0,
        avgUAS: 0,
        avgPraktik: 0,
        avgFinal: 0,
        totalStudents: 0,
      };
    }

    const totals = filteredGrades.reduce(
      (acc, grade) => ({
        tugas: acc.tugas + (Number(grade.tugas) || 0),
        kuis: acc.kuis + (Number(grade.kuis) || 0),
        uts: acc.uts + (Number(grade.uts) || 0),
        uas: acc.uas + (Number(grade.uas) || 0),
        praktik: acc.praktik + (Number(grade.praktik) || 0),
        final: acc.final + (Number(grade.final_grade) || 0),
      }),
      { tugas: 0, kuis: 0, uts: 0, uas: 0, praktik: 0, final: 0 }
    );

    const count = filteredGrades.length;
    return {
      avgTugas: (totals.tugas / count).toFixed(1),
      avgKuis: (totals.kuis / count).toFixed(1),
      avgUTS: (totals.uts / count).toFixed(1),
      avgUAS: (totals.uas / count).toFixed(1),
      avgPraktik: (totals.praktik / count).toFixed(1),
      avgFinal: (totals.final / count).toFixed(1),
      totalStudents: count,
    };
  }, [filteredGrades]);

  // Render chart based on type

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">Analytics Nilai</h1>
            <p className="text-muted-foreground">Analisis dan perbandingan nilai siswa</p>
          </div>
          <Award className="h-8 w-8 text-primary" />
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Kelas</label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
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
                <label className="text-sm font-medium">Tahun Ajaran</label>
                <Select value={selectedYear} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={selectedYear}>{selectedYear}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tipe Grafik</label>
                <Select value={chartType} onValueChange={(value: 'bar' | 'line') => setChartType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Bar Chart</SelectItem>
                    <SelectItem value="line">Line Chart</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalStudents}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rata-rata Tugas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{overallStats.avgTugas}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rata-rata Kuis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{overallStats.avgKuis}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rata-rata UTS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{overallStats.avgUTS}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rata-rata UAS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{overallStats.avgUAS}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rata-rata Praktik</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-teal-600">{overallStats.avgPraktik}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Nilai Akhir</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{overallStats.avgFinal}</div>
            </CardContent>
          </Card>
        </div>

        {/* Average Grades by Subject */}
        {averageBySubject.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Rata-rata Nilai per Mata Pelajaran
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <ResponsiveContainer width="100%" height={400} minWidth={600}>
                  {chartType === 'bar' ? (
                    <BarChart data={averageBySubject}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="subject" 
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Rata-rata Tugas" fill="#3b82f6" />
                      <Bar dataKey="Rata-rata Kuis" fill="#8b5cf6" />
                      <Bar dataKey="Rata-rata UTS" fill="#f59e0b" />
                      <Bar dataKey="Rata-rata UAS" fill="#f97316" />
                      <Bar dataKey="Rata-rata Praktik" fill="#14b8a6" />
                      <Bar dataKey="Nilai Akhir" fill="#10b981" />
                    </BarChart>
                  ) : (
                    <LineChart data={averageBySubject}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="subject" 
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="Rata-rata Tugas" stroke="#3b82f6" strokeWidth={2} />
                      <Line type="monotone" dataKey="Rata-rata Kuis" stroke="#8b5cf6" strokeWidth={2} />
                      <Line type="monotone" dataKey="Rata-rata UTS" stroke="#f59e0b" strokeWidth={2} />
                      <Line type="monotone" dataKey="Rata-rata UAS" stroke="#f97316" strokeWidth={2} />
                      <Line type="monotone" dataKey="Rata-rata Praktik" stroke="#14b8a6" strokeWidth={2} />
                      <Line type="monotone" dataKey="Nilai Akhir" stroke="#10b981" strokeWidth={3} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Average Grades by Class */}
        {selectedClass === 'all' && averageByClass.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Rata-rata Nilai per Kelas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <ResponsiveContainer width="100%" height={400} minWidth={600}>
                  {chartType === 'bar' ? (
                    <BarChart data={averageByClass}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="class" 
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Rata-rata Tugas" fill="#3b82f6" />
                      <Bar dataKey="Rata-rata Kuis" fill="#8b5cf6" />
                      <Bar dataKey="Rata-rata UTS" fill="#f59e0b" />
                      <Bar dataKey="Rata-rata UAS" fill="#f97316" />
                      <Bar dataKey="Rata-rata Praktik" fill="#14b8a6" />
                      <Bar dataKey="Nilai Akhir" fill="#10b981" />
                    </BarChart>
                  ) : (
                    <LineChart data={averageByClass}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="class" 
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="Rata-rata Tugas" stroke="#3b82f6" strokeWidth={2} />
                      <Line type="monotone" dataKey="Rata-rata Kuis" stroke="#8b5cf6" strokeWidth={2} />
                      <Line type="monotone" dataKey="Rata-rata UTS" stroke="#f59e0b" strokeWidth={2} />
                      <Line type="monotone" dataKey="Rata-rata UAS" stroke="#f97316" strokeWidth={2} />
                      <Line type="monotone" dataKey="Rata-rata Praktik" stroke="#14b8a6" strokeWidth={2} />
                      <Line type="monotone" dataKey="Nilai Akhir" stroke="#10b981" strokeWidth={3} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Insights */}
        {averageBySubject.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Insight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Mata pelajaran dengan nilai tertinggi:</strong>{' '}
                  {averageBySubject.reduce((max, curr) => 
                    Number(curr['Nilai Akhir']) > Number(max['Nilai Akhir']) ? curr : max, 
                    averageBySubject[0]
                  )?.subject || '-'} (Nilai Akhir: {
                    Math.max(...averageBySubject.map(d => Number(d['Nilai Akhir'])))
                  })
                </p>
                <p>
                  <strong>Mata pelajaran dengan nilai terendah:</strong>{' '}
                  {averageBySubject.reduce((min, curr) => 
                    Number(curr['Nilai Akhir']) < Number(min['Nilai Akhir']) ? curr : min, 
                    averageBySubject[0]
                  )?.subject || '-'} (Nilai Akhir: {
                    Math.min(...averageBySubject.map(d => Number(d['Nilai Akhir'])))
                  })
                </p>
                {selectedClass === 'all' && averageByClass.length > 0 && (
                  <p>
                    <strong>Kelas dengan nilai rata-rata tertinggi:</strong>{' '}
                    {averageByClass.reduce((max, curr) => 
                      Number(curr['Nilai Akhir']) > Number(max['Nilai Akhir']) ? curr : max, 
                      averageByClass[0]
                    )?.class || '-'} (Nilai Akhir: {
                      Math.max(...averageByClass.map(d => Number(d['Nilai Akhir'])))
                    })
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {(averageBySubject.length === 0 || !filteredGrades) && (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Tidak ada data nilai untuk filter yang dipilih</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default GradeAnalytics;
