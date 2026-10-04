import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Printer, Download, Award, TrendingUp, FileText } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF, addSignatureToPDF } from '@/lib/pdfLetterhead';

interface GradeInput {
  student_id: string;
  schedule_id: string;
  tugas: number;
  kuis: number;
  uts: number;
  uas: number;
  praktik: number;
}

function GradesPage() {
  const { userRole, user } = useAuth();
  const { selectedYear } = useAcademicYear();
  
  // Function to convert name to Title Case
  const toTitleCase = (name: string): string => {
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [gradeInputs, setGradeInputs] = useState<Record<string, GradeInput>>({});
  const queryClient = useQueryClient();

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

  const { data: schedules } = useQuery({
    queryKey: ['teacher-schedules-grades', user?.id, userRole, selectedYear],
    queryFn: async () => {
      if (!selectedYear) return [];
      
      if (userRole === 'admin') {
        const { data, error } = await supabase
          .from('schedules')
          .select('*, classes(name, grade)')
          .eq('academic_year', selectedYear)
          .order('subject');
        if (error) throw error;
        return data;
      } else {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();
        
        if (!teacher) return [];

        const { data, error } = await supabase
          .from('schedules')
          .select('*, classes(name, grade)')
          .eq('teacher_id', teacher.id)
          .eq('academic_year', selectedYear)
          .order('subject');
        
        if (error) throw error;
        return data;
      }
    },
    enabled: !!user?.id && !!userRole,
  });

  const { data: students } = useQuery({
    queryKey: ['students-with-grades', selectedClass],
    queryFn: async () => {
      let query = supabase
        .from('students')
        .select(`
          *,
          classes (
            name
          )
        `)
        .order('full_name');

      if (selectedClass !== 'all') {
        query = query.eq('class_id', selectedClass);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: scheduleStudents } = useQuery({
    queryKey: ['schedule-students-grades', selectedSchedule],
    queryFn: async () => {
      if (!selectedSchedule) return [];
      
      const { data: schedule } = await supabase
        .from('schedules')
        .select('class_id')
        .eq('id', selectedSchedule)
        .maybeSingle();
      
      if (!schedule) return [];

      const { data: students, error } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', schedule.class_id)
        .order('full_name');
      
      if (error) throw error;

      // Fetch existing grades
      const { data: existingGrades } = await supabase
        .from('grades')
        .select('*')
        .eq('schedule_id', selectedSchedule);

      // Merge students with their grades
      const studentsWithGrades = students?.map(student => {
        const grade = existingGrades?.find(g => g.student_id === student.id);
        return {
          ...student,
          existingGrade: grade,
        };
      });

      return studentsWithGrades || [];
    },
    enabled: !!selectedSchedule,
  });

  const saveGradesMutation = useMutation({
    mutationFn: async (grades: GradeInput[]) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const gradesWithUser = grades.map(g => ({
        ...g,
        created_by: user.id,
      }));

      const { error } = await supabase
        .from('grades')
        .upsert(gradesWithUser, { 
          onConflict: 'student_id,schedule_id',
          ignoreDuplicates: false 
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-students-grades'] });
      toast.success('Nilai berhasil disimpan');
      setIsDialogOpen(false);
      setGradeInputs({});
      setSelectedSchedule('');
    },
    onError: (error: any) => {
      console.error('Error saving grades:', error);
      toast.error(`Gagal menyimpan nilai: ${error.message}`);
    },
  });

  const updateGradeInput = (studentId: string, field: keyof GradeInput, value: number) => {
    setGradeInputs(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        student_id: studentId,
        schedule_id: selectedSchedule,
        [field]: value,
      },
    }));
  };

  const calculateFinalGrade = (input: Partial<GradeInput>) => {
    const tugas = input.tugas || 0;
    const kuis = input.kuis || 0;
    const uts = input.uts || 0;
    const uas = input.uas || 0;
    const praktik = input.praktik || 0;
    
    return Math.round((tugas * 0.2 + kuis * 0.2 + uts * 0.25 + uas * 0.25 + praktik * 0.1));
  };

  const getGradeLabel = (score: number) => {
    if (score >= 90) return { label: 'A', color: 'text-green-600 bg-green-50' };
    if (score >= 80) return { label: 'B', color: 'text-blue-600 bg-blue-50' };
    if (score >= 70) return { label: 'C', color: 'text-yellow-600 bg-yellow-50' };
    if (score >= 60) return { label: 'D', color: 'text-orange-600 bg-orange-50' };
    return { label: 'E', color: 'text-red-600 bg-red-50' };
  };

  const handleSaveGrades = () => {
    const grades = Object.values(gradeInputs);
    if (grades.length === 0) {
      toast.error('Tidak ada nilai yang diinput');
      return;
    }
    saveGradesMutation.mutate(grades);
  };

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('school_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const handleExportPDF = async () => {
    if (!scheduleStudents || !selectedSchedule) {
      toast.error('Pilih mata pelajaran terlebih dahulu');
      return;
    }

    const schedule = schedules?.find(s => s.id === selectedSchedule);
    if (!schedule) return;

    // Get teacher info for the schedule
    const { data: teacherData } = await supabase
      .from('teachers')
      .select('nip, user_id, profiles(full_name)')
      .eq('id', schedule.teacher_id)
      .single();

    const doc = new jsPDF();
    
    // Add letterhead
    const startY = await addLetterheadToPDF(doc, schoolSettings);
    
    // Report title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN NILAI SISWA', 105, startY, { align: 'center' });
    
    // Report info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Mata Pelajaran: ${schedule.subject}`, 14, startY + 8);
    doc.text(`Kelas: ${schedule.classes?.name || '-'}`, 14, startY + 14);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, startY + 20);

    // Table data
    const tableData = scheduleStudents.map((student: any, index: number) => {
      const grade = student.existingGrade;
      const finalGrade = grade?.final_grade || 0;
      const { label } = getGradeLabel(Number(finalGrade));
      
      return [
        index + 1,
        student.nis,
        toTitleCase(student.full_name),
        grade?.tugas || 0,
        grade?.kuis || 0,
        grade?.uts || 0,
        grade?.uas || 0,
        grade?.praktik || 0,
        Number(finalGrade).toFixed(2),
        label
      ];
    });

    autoTable(doc, {
      startY: startY + 26,
      head: [['No', 'NIS', 'Nama', 'Tugas', 'Kuis', 'UTS', 'UAS', 'Praktik', 'Nilai', 'Grade']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] },
      styles: { fontSize: 9 },
    });

    // Save report data to database
    const finalY = (doc as any).lastAutoTable.finalY;
    const reportData = {
      verification: 'DOKUMEN VALID',
      type: 'Laporan Nilai Siswa',
      school: schoolSettings?.school_name,
      subject: schedule.subject,
      class: schedule.classes?.name,
      printDate: new Date().toISOString(),
      totalStudents: scheduleStudents.length,
      grades: scheduleStudents.map((s: any) => {
        const grade = s.existingGrade;
        const finalGrade = grade?.final_grade || 0;
        return {
          nis: s.nis,
          nama: toTitleCase(s.full_name),
          tugas: grade?.tugas || 0,
          kuis: grade?.kuis || 0,
          uts: grade?.uts || 0,
          uas: grade?.uas || 0,
          praktik: grade?.praktik || 0,
          nilaiAkhir: Number(finalGrade).toFixed(2),
          predikat: getGradeLabel(Number(finalGrade)).label
        };
      })
    };

    // Generate serial number and save to database
    const { data: serialData, error: serialError } = await supabase.rpc('generate_report_serial');
    if (serialError) {
      console.error('Error generating serial:', serialError);
      toast.error('Gagal menggenerate nomor seri laporan');
      return;
    }
    
    const { error: insertError } = await supabase
      .from('verified_reports')
      .insert({
        serial_number: serialData,
        report_type: 'grades',
        report_data: reportData,
        created_by: user?.id
      });

    if (insertError) {
      console.error('Error saving report:', insertError);
      toast.error('Gagal menyimpan data laporan untuk verifikasi');
      return;
    }

    // Add signature with serial number QR code
    await addSignatureToPDF(doc, schoolSettings, schoolSettings?.headmaster_name, schoolSettings?.headmaster_nip, finalY, serialData);

    doc.save(`nilai-${schedule.subject}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Laporan berhasil dicetak dengan QR code verifikasi');
  };

  const handleExport = () => {
    if (!scheduleStudents || !selectedSchedule) {
      toast.error('Pilih mata pelajaran terlebih dahulu');
      return;
    }

    const schedule = schedules?.find(s => s.id === selectedSchedule);
    
    const csvContent = [
      ['NIS', 'Nama', 'Kelas', 'Tugas', 'Kuis', 'UTS', 'UAS', 'Praktik', 'Nilai Akhir', 'Predikat'].join(','),
      ...scheduleStudents.map((s: any) => {
        const grade = s.existingGrade;
        const finalGrade = grade?.final_grade || 0;
        const { label } = getGradeLabel(Number(finalGrade));
        return [
          s.nis,
          toTitleCase(s.full_name),
          schedule?.classes?.name || '',
          grade?.tugas || 0,
          grade?.kuis || 0,
          grade?.uts || 0,
          grade?.uas || 0,
          grade?.praktik || 0,
          Number(finalGrade).toFixed(2),
          label
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nilai-${schedule?.subject}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filteredStudents = students?.filter((student) =>
    toTitleCase(student.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.nis?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">Input Nilai</h1>
            <p className="text-muted-foreground">Kelola nilai siswa per mata pelajaran</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportPDF} className="gap-2">
              <FileText className="h-4 w-4" />
              Cetak PDF
            </Button>
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  Input Nilai
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Input Nilai Siswa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Pilih Mata Pelajaran</Label>
                    <Select value={selectedSchedule} onValueChange={setSelectedSchedule}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih mata pelajaran" />
                      </SelectTrigger>
                      <SelectContent>
                        {schedules?.map((schedule) => (
                          <SelectItem key={schedule.id} value={schedule.id}>
                            {schedule.subject} - {schedule.classes?.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedSchedule && scheduleStudents && scheduleStudents.length > 0 && (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">No</TableHead>
                              <TableHead className="w-[200px]">Nama Siswa</TableHead>
                              <TableHead className="w-[100px]">Tugas (20%)</TableHead>
                              <TableHead className="w-[100px]">Kuis (20%)</TableHead>
                              <TableHead className="w-[100px]">UTS (25%)</TableHead>
                              <TableHead className="w-[100px]">UAS (25%)</TableHead>
                              <TableHead className="w-[100px]">Praktik (10%)</TableHead>
                              <TableHead className="w-[100px]">Nilai Akhir</TableHead>
                              <TableHead className="w-[80px]">Predikat</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {scheduleStudents.map((student: any, index) => {
                              // Initialize with existing grades or empty
                              const existingGrade = student.existingGrade;
                              const input = gradeInputs[student.id] || {
                                tugas: existingGrade?.tugas || 0,
                                kuis: existingGrade?.kuis || 0,
                                uts: existingGrade?.uts || 0,
                                uas: existingGrade?.uas || 0,
                                praktik: existingGrade?.praktik || 0,
                                student_id: student.id,
                                schedule_id: selectedSchedule
                              };
                              
                              // If not in gradeInputs yet but has existing grade, set it
                              if (!gradeInputs[student.id] && existingGrade) {
                                setGradeInputs(prev => ({
                                  ...prev,
                                  [student.id]: input
                                }));
                              }
                              
                              const finalGrade = calculateFinalGrade(input);
                              const { label, color } = getGradeLabel(finalGrade);
                              
                              return (
                                <TableRow key={student.id}>
                                  <TableCell>{index + 1}</TableCell>
                                  <TableCell className="font-medium">{toTitleCase(student.full_name)}</TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={input.tugas || ''}
                                      onChange={(e) => updateGradeInput(student.id, 'tugas', Number(e.target.value))}
                                      placeholder="0-100"
                                      className="w-20"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={input.kuis || ''}
                                      onChange={(e) => updateGradeInput(student.id, 'kuis', Number(e.target.value))}
                                      placeholder="0-100"
                                      className="w-20"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={input.uts || ''}
                                      onChange={(e) => updateGradeInput(student.id, 'uts', Number(e.target.value))}
                                      placeholder="0-100"
                                      className="w-20"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={input.uas || ''}
                                      onChange={(e) => updateGradeInput(student.id, 'uas', Number(e.target.value))}
                                      placeholder="0-100"
                                      className="w-20"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={input.praktik || ''}
                                      onChange={(e) => updateGradeInput(student.id, 'praktik', Number(e.target.value))}
                                      placeholder="0-100"
                                      className="w-20"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <span className="font-bold text-lg">{finalGrade}</span>
                                  </TableCell>
                                  <TableCell>
                                    <span className={`px-3 py-1 rounded-full font-bold ${color}`}>
                                      {label}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                          Batal
                        </Button>
                        <Button onClick={handleSaveGrades} className="bg-gradient-primary">
                          Simpan Nilai
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filter Section */}
        <Card className="card-hover border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Filter Siswa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari nama atau NIS..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Kelas" />
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
          </CardContent>
        </Card>

        {/* Students List */}
        <Card className="card-hover border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Daftar Siswa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>NIS</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>Jenis Kelamin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents && filteredStudents.length > 0 ? (
                  filteredStudents.map((student, index) => (
                    <TableRow key={student.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{student.nis}</TableCell>
                      <TableCell>{toTitleCase(student.full_name)}</TableCell>
                      <TableCell>{student.classes?.name || '-'}</TableCell>
                      <TableCell>{student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Tidak ada data siswa
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function Grades() {
  return (
    <GradesPage />
  );
}
