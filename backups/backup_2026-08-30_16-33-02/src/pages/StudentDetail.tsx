import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { ArrowLeft, User, MapPin, Calendar, Phone, GraduationCap, AlertTriangle, CalendarCheck, CalendarIcon, X, Download } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const { data: student, isLoading: isLoadingStudent } = useQuery({
    queryKey: ['student-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select(`
          *,
          classes (
            name,
            grade,
            academic_year
          )
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  const { data: violations, isLoading: isLoadingViolations } = useQuery({
    queryKey: ['student-violations', id, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('student_violations')
        .select(`
          *,
          violation_types (
            name,
            category,
            points
          )
        `)
        .eq('student_id', id);
      
      if (startDate) {
        query = query.gte('violation_date', format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        query = query.lte('violation_date', format(endDate, 'yyyy-MM-dd'));
      }
      
      const { data, error } = await query.order('violation_date', { ascending: false });
      
      if (error) throw error;
      
      // Fetch reporter names separately
      const violationsWithReporter = await Promise.all(
        (data || []).map(async (violation) => {
          const { data: reporterData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', violation.reported_by)
            .single();
          
          return {
            ...violation,
            reporter_name: reporterData?.full_name || 'Unknown'
          };
        })
      );
      
      return violationsWithReporter;
    },
  });

  const { data: attendance, isLoading: isLoadingAttendance } = useQuery({
    queryKey: ['student-attendance', id, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('attendance')
        .select(`
          *,
          schedules (
            subject,
            day_of_week,
            start_time,
            end_time
          )
        `)
        .eq('student_id', id);
      
      if (startDate) {
        query = query.gte('date', format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        query = query.lte('date', format(endDate, 'yyyy-MM-dd'));
      }
      
      const { data, error } = await query.order('date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const totalViolationPoints = violations?.reduce((sum, v) => sum + v.points, 0) || 0;
  
  const attendanceStats = {
    hadir: attendance?.filter(a => a.status === 'hadir').length || 0,
    sakit: attendance?.filter(a => a.status === 'sakit').length || 0,
    izin: attendance?.filter(a => a.status === 'izin').length || 0,
    alpa: attendance?.filter(a => a.status === 'alpa').length || 0,
    total: attendance?.length || 0,
  };

  const attendancePercentage = attendanceStats.total > 0 
    ? ((attendanceStats.hadir / attendanceStats.total) * 100).toFixed(1)
    : 0;

  const getViolationColor = (points: number) => {
    if (points === 0) return 'bg-green-500/10 text-green-600 border-green-500/20';
    if (points < 50) return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
    return 'bg-red-500/10 text-red-600 border-red-500/20';
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ringan': return 'bg-blue-500/10 text-blue-600';
      case 'sedang': return 'bg-yellow-500/10 text-yellow-600';
      case 'berat': return 'bg-red-500/10 text-red-600';
      default: return 'bg-gray-500/10 text-gray-600';
    }
  };

  if (isLoadingStudent) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Memuat data siswa...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!student) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <p className="text-muted-foreground">Data siswa tidak ditemukan</p>
          <Button onClick={() => navigate('/students')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke Daftar Siswa
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const handleResetFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const handleExportPDF = async () => {
    if (!student) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 20;

      // Helper function to draw a simple bar chart
      const drawBarChart = (x: number, y: number, width: number, height: number, data: {label: string, value: number, color: string}[]) => {
        const maxValue = Math.max(...data.map(d => d.value), 1);
        const barWidth = width / data.length - 5;
        
        // Draw bars
        data.forEach((item, index) => {
          const barHeight = (item.value / maxValue) * height;
          const barX = x + (index * (barWidth + 5));
          const barY = y + height - barHeight;
          
          // Draw bar
          doc.setFillColor(item.color);
          doc.rect(barX, barY, barWidth, barHeight, 'F');
          
          // Draw value on top
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          doc.text(item.value.toString(), barX + barWidth/2, barY - 2, { align: 'center' });
          
          // Draw label
          doc.setFontSize(8);
          doc.text(item.label, barX + barWidth/2, y + height + 5, { align: 'center' });
        });
      };

      // Helper function to draw a simple pie chart
      const drawPieChart = (centerX: number, centerY: number, radius: number, data: {label: string, value: number, color: string}[]) => {
        const total = data.reduce((sum, d) => sum + d.value, 0);
        if (total === 0) return;
        
        let currentAngle = -Math.PI / 2; // Start from top
        
        data.forEach((item) => {
          const sliceAngle = (item.value / total) * 2 * Math.PI;
          
          // Draw slice
          doc.setFillColor(item.color);
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(1);
          
          const startX = centerX + radius * Math.cos(currentAngle);
          const startY = centerY + radius * Math.sin(currentAngle);
          
          doc.circle(centerX, centerY, radius, 'S');
          
          // Draw path for slice
          const points: [number, number][] = [[centerX, centerY]];
          const steps = Math.max(10, Math.floor(sliceAngle * 20));
          for (let i = 0; i <= steps; i++) {
            const angle = currentAngle + (sliceAngle * i / steps);
            points.push([
              centerX + radius * Math.cos(angle),
              centerY + radius * Math.sin(angle)
            ]);
          }
          points.push([centerX, centerY]);
          
          doc.setFillColor(item.color);
          doc.lines(points.slice(1).map((p, i) => [
            p[0] - points[i][0],
            p[1] - points[i][1]
          ]), points[0][0], points[0][1], [1, 1], 'F');
          
          currentAngle += sliceAngle;
        });
      };

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('LAPORAN LENGKAP SISWA', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      // Period Filter Info
      if (startDate || endDate) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const periodText = startDate && endDate
          ? `Periode: ${format(startDate, 'dd MMM yyyy', { locale: idLocale })} - ${format(endDate, 'dd MMM yyyy', { locale: idLocale })}`
          : startDate
          ? `Periode: Dari ${format(startDate, 'dd MMM yyyy', { locale: idLocale })}`
          : `Periode: Sampai ${format(endDate!, 'dd MMM yyyy', { locale: idLocale })}`;
        doc.text(periodText, pageWidth / 2, yPos, { align: 'center' });
        yPos += 8;
      }

      doc.setFontSize(10);
      doc.text(`Tanggal Cetak: ${format(new Date(), 'dd MMMM yyyy', { locale: idLocale })}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Student Profile Section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('DATA SISWA', 14, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const studentData = [
        ['Nama Lengkap', student.full_name],
        ['NIS', student.nis],
        ['NISN', student.nisn || '-'],
        ['Kelas', student.classes ? `${student.classes.name} - Grade ${student.classes.grade}` : '-'],
        ['Jenis Kelamin', student.gender === 'L' ? 'Laki-laki' : 'Perempuan'],
        ['Tempat, Tanggal Lahir', student.birth_place && student.birth_date ? `${student.birth_place}, ${format(new Date(student.birth_date), 'dd MMMM yyyy', { locale: idLocale })}` : '-'],
        ['Alamat', student.address || '-'],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: studentData,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          1: { cellWidth: 'auto' },
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;

      // Parent Information Section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('DATA ORANG TUA', 14, yPos);
      yPos += 8;

      const parentData = [
        ['Nama Orang Tua', student.parent_name || '-'],
        ['No. HP Orang Tua', student.parent_phone || '-'],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: parentData,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          1: { cellWidth: 'auto' },
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;

      // Attendance Summary Section with Chart
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('RINGKASAN KEHADIRAN', 14, yPos);
      yPos += 8;

      // Draw attendance bar chart
      const attendanceChartData = [
        { label: 'Hadir', value: attendanceStats.hadir, color: '#22c55e' },
        { label: 'Sakit', value: attendanceStats.sakit, color: '#eab308' },
        { label: 'Izin', value: attendanceStats.izin, color: '#3b82f6' },
        { label: 'Alpa', value: attendanceStats.alpa, color: '#ef4444' },
      ];

      drawBarChart(14, yPos, 90, 40, attendanceChartData);

      // Add attendance summary table next to chart
      const attendanceSummary = [
        ['Hadir', attendanceStats.hadir.toString()],
        ['Sakit', attendanceStats.sakit.toString()],
        ['Izin', attendanceStats.izin.toString()],
        ['Alpa', attendanceStats.alpa.toString()],
        ['Total', attendanceStats.total.toString()],
        ['Persentase', `${attendancePercentage}%`],
      ];

      autoTable(doc, {
        startY: yPos,
        margin: { left: 110 },
        head: [],
        body: attendanceSummary,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 40 },
          1: { cellWidth: 30, halign: 'center' },
        },
      });

      yPos = Math.max((doc as any).lastAutoTable.finalY, yPos + 50) + 10;

      // Check if new page is needed
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }

      // Attendance History Section
      if (attendance && attendance.length > 0) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('RIWAYAT KEHADIRAN', 14, yPos);
        yPos += 5;

        const attendanceTableData = attendance.slice(0, 30).map((record) => [
          format(new Date(record.date), 'dd/MM/yyyy'),
          record.schedules?.subject || '-',
          record.status.charAt(0).toUpperCase() + record.status.slice(1),
          record.notes || '-',
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Tanggal', 'Mata Pelajaran', 'Status', 'Catatan']],
          body: attendanceTableData,
          theme: 'striped',
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [66, 139, 202], textColor: 255 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 50 },
            2: { cellWidth: 25, halign: 'center' },
            3: { cellWidth: 'auto' },
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // Check if new page is needed
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }

      // Violation Summary Section with Chart
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('RINGKASAN PELANGGARAN', 14, yPos);
      yPos += 8;

      // Create violation bar chart by category
      if (violations && violations.length > 0) {
        const violationsByCategory = violations.reduce((acc: any, v) => {
          const category = v.violation_types?.category || 'lainnya';
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        }, {});

        const violationChartData = Object.entries(violationsByCategory).map(([key, value]) => ({
          label: key.charAt(0).toUpperCase() + key.slice(1),
          value: value as number,
          color: key === 'ringan' ? '#3b82f6' : key === 'sedang' ? '#eab308' : key === 'berat' ? '#ef4444' : '#9ca3af'
        }));

        drawBarChart(14, yPos, 90, 40, violationChartData);

        // Add violation summary table next to chart
        const violationSummary = [
          ['Total Pelanggaran', violations.length.toString()],
          ['Total Poin', totalViolationPoints.toString()],
          ['Pelanggaran Terakhir', format(new Date(violations[0].violation_date), 'dd/MM/yyyy')],
        ];

        autoTable(doc, {
          startY: yPos,
          margin: { left: 110 },
          head: [],
          body: violationSummary,
          theme: 'grid',
          styles: { fontSize: 10, cellPadding: 3 },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 50 },
            1: { cellWidth: 30, halign: 'center' },
          },
        });

        yPos = Math.max((doc as any).lastAutoTable.finalY, yPos + 50) + 10;
      } else {
        // No violations case
        const violationSummary = [
          ['Total Pelanggaran', '0'],
          ['Total Poin', '0'],
          ['Pelanggaran Terakhir', '-'],
        ];

        autoTable(doc, {
          startY: yPos,
          head: [],
          body: violationSummary,
          theme: 'grid',
          styles: { fontSize: 10, cellPadding: 3 },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 50 },
            1: { cellWidth: 30, halign: 'center' },
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // Violation History Section
      if (violations && violations.length > 0) {
        // Check if new page is needed
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('RIWAYAT PELANGGARAN', 14, yPos);
        yPos += 5;

        const violationTableData = violations.map((violation) => [
          format(new Date(violation.violation_date), 'dd/MM/yyyy'),
          violation.violation_types?.name || '-',
          violation.violation_types?.category || '-',
          violation.points.toString(),
          violation.reporter_name || '-',
          violation.notes || '-',
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Tanggal', 'Jenis', 'Kategori', 'Poin', 'Pelapor', 'Catatan']],
          body: violationTableData,
          theme: 'striped',
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [220, 53, 69], textColor: 255 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 40 },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 15, halign: 'center' },
            4: { cellWidth: 35 },
            5: { cellWidth: 'auto' },
          },
        });
      }

      // Save PDF
      const fileName = `Laporan_${student.full_name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      doc.save(fileName);
      
      toast.success('Laporan berhasil diexport ke PDF');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Gagal mengexport laporan ke PDF');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => navigate('/students')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Detail Siswa</h1>
                <p className="text-muted-foreground">Informasi lengkap siswa</p>
              </div>
            </div>
            <Button onClick={handleExportPDF} className="gap-2">
              <Download className="h-4 w-4" />
              Export PDF
            </Button>
          </div>

          {/* Date Range Filter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filter Periode</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-sm font-medium mb-2 block">Tanggal Mulai</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, 'dd MMM yyyy', { locale: idLocale }) : 'Pilih tanggal'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <label className="text-sm font-medium mb-2 block">Tanggal Akhir</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, 'dd MMM yyyy', { locale: idLocale }) : 'Pilih tanggal'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        disabled={(date) => startDate ? date < startDate : false}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {(startDate || endDate) && (
                  <Button
                    variant="outline"
                    onClick={handleResetFilter}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Reset Filter
                  </Button>
                )}
              </div>

              {(startDate || endDate) && (
                <div className="mt-4">
                  <Badge variant="secondary" className="text-sm">
                    {startDate && endDate
                      ? `${format(startDate, 'dd MMM yyyy', { locale: idLocale })} - ${format(endDate, 'dd MMM yyyy', { locale: idLocale })}`
                      : startDate
                      ? `Dari ${format(startDate, 'dd MMM yyyy', { locale: idLocale })}`
                      : `Sampai ${format(endDate!, 'dd MMM yyyy', { locale: idLocale })}`}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Student Profile Card */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-center">Profil Siswa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center space-y-4">
                <Avatar className="h-32 w-32">
                  <AvatarImage src={student.photo_url || ''} alt={student.full_name} />
                  <AvatarFallback className="text-2xl">
                    {student.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center space-y-1">
                  <h3 className="text-xl font-bold">{student.full_name}</h3>
                  <p className="text-sm text-muted-foreground">NIS: {student.nis}</p>
                  {student.nisn && (
                    <p className="text-sm text-muted-foreground">NISN: {student.nisn}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Kelas</p>
                    <p className="text-sm text-muted-foreground">
                      {student.classes?.name || 'Belum ada kelas'} 
                      {student.classes && ` - Grade ${student.classes.grade}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Jenis Kelamin</p>
                    <p className="text-sm text-muted-foreground">
                      {student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                    </p>
                  </div>
                </div>

                {student.birth_place && student.birth_date && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Tempat, Tanggal Lahir</p>
                      <p className="text-sm text-muted-foreground">
                        {student.birth_place}, {format(new Date(student.birth_date), 'dd MMMM yyyy', { locale: idLocale })}
                      </p>
                    </div>
                  </div>
                )}

                {student.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-sm font-medium">Alamat</p>
                      <p className="text-sm text-muted-foreground">{student.address}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Parent Information and Violation Summary */}
          <div className="md:col-span-2 space-y-6">
            {/* Parent Information Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Data Orang Tua
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Nama Orang Tua</p>
                    <p className="text-base font-medium">{student.parent_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">No. HP Orang Tua</p>
                    <p className="text-base font-medium">{student.parent_phone || '-'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Violation Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Ringkasan Pelanggaran
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="text-center p-4 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{violations?.length || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Pelanggaran</p>
                  </div>
                  <div className={`text-center p-4 rounded-lg border ${getViolationColor(totalViolationPoints)}`}>
                    <p className="text-2xl font-bold">{totalViolationPoints}</p>
                    <p className="text-sm">Total Poin</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">
                      {violations?.[0] ? format(new Date(violations[0].violation_date), 'dd/MM/yy') : '-'}
                    </p>
                    <p className="text-sm text-muted-foreground">Pelanggaran Terakhir</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Attendance Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarCheck className="h-5 w-5" />
                  Ringkasan Kehadiran
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-5">
                  <div className="text-center p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-2xl font-bold text-green-600">{attendanceStats.hadir}</p>
                    <p className="text-sm text-green-600">Hadir</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-2xl font-bold text-yellow-600">{attendanceStats.sakit}</p>
                    <p className="text-sm text-yellow-600">Sakit</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-2xl font-bold text-blue-600">{attendanceStats.izin}</p>
                    <p className="text-sm text-blue-600">Izin</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-2xl font-bold text-red-600">{attendanceStats.alpa}</p>
                    <p className="text-sm text-red-600">Alpa</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-2xl font-bold text-primary">{attendancePercentage}%</p>
                    <p className="text-sm text-primary">Persentase</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Attendance History Card */}
            <Card>
              <CardHeader>
                <CardTitle>Riwayat Kehadiran</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingAttendance ? (
                  <p className="text-center text-muted-foreground py-8">Memuat data kehadiran...</p>
                ) : attendance && attendance.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Mata Pelajaran</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Catatan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attendance.slice(0, 20).map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(record.date), 'dd MMM yyyy', { locale: idLocale })}
                            </TableCell>
                            <TableCell className="font-medium">
                              {record.schedules?.subject || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                className={
                                  record.status === 'hadir' 
                                    ? 'bg-green-500/10 text-green-600' 
                                    : record.status === 'sakit' 
                                    ? 'bg-yellow-500/10 text-yellow-600'
                                    : record.status === 'izin'
                                    ? 'bg-blue-500/10 text-blue-600'
                                    : 'bg-red-500/10 text-red-600'
                                }
                              >
                                {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {record.notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {attendance.length > 20 && (
                      <p className="text-center text-sm text-muted-foreground mt-4">
                        Menampilkan 20 dari {attendance.length} data kehadiran
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CalendarCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Tidak ada riwayat kehadiran</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Violation History Card */}
            <Card>
              <CardHeader>
                <CardTitle>Riwayat Pelanggaran</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingViolations ? (
                  <p className="text-center text-muted-foreground py-8">Memuat data pelanggaran...</p>
                ) : violations && violations.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Jenis Pelanggaran</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead className="text-right">Poin</TableHead>
                          <TableHead>Pelapor</TableHead>
                          <TableHead>Catatan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {violations.map((violation) => (
                          <TableRow key={violation.id}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(violation.violation_date), 'dd MMM yyyy', { locale: idLocale })}
                            </TableCell>
                            <TableCell className="font-medium">
                              {violation.violation_types?.name}
                            </TableCell>
                            <TableCell>
                              <Badge className={getCategoryColor(violation.violation_types?.category || '')}>
                                {violation.violation_types?.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {violation.points}
                            </TableCell>
                            <TableCell>
                              {violation.reporter_name || '-'}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {violation.notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Tidak ada riwayat pelanggaran</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function StudentDetail() {
  return (
    <ProtectedRoute>
      <StudentDetailPage />
    </ProtectedRoute>
  );
}
