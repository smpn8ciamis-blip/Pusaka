// src/pages/HomeroomAttendance.tsx
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserX,
  FileText,
  Download,
  Calendar,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Stethoscope,
  Plus,
  ClipboardCheck,
  Edit2,
  Save,
  X as XIcon,
  Info,
} from 'lucide-react';
import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ImportAttendance } from '@/components/ImportAttendance';
import { useAttendanceDaySettings, isAttendanceAllowedForDate, getActiveDayNames } from '@/hooks/useAttendanceDaySettings';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

const COLORS = {
  hadir: '#10b981',
  sakit: '#f59e0b',
  izin: '#3b82f6',
  alpa: '#ef4444',
};

// Function to convert name to Title Case
const toTitleCase = (name: string): string => {
  return name
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Editable row component for homeroom teachers
const EditableAttendanceRow = ({ record, onUpdate }: { record: any; onUpdate: () => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedStatus, setEditedStatus] = useState(record.status);
  const [editedNotes, setEditedNotes] = useState(record.notes || '');

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('attendance')
        .update({
          status: editedStatus,
          notes: editedNotes || null,
        })
        .eq('id', record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Absensi berhasil diperbarui');
      setIsEditing(false);
      onUpdate();
    },
    onError: (error: any) => {
      toast.error(`Gagal memperbarui absensi: ${error.message}`);
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'hadir':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'sakit':
        return <Stethoscope className="w-4 h-4 text-orange-500" />;
      case 'izin':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'alpa':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>{record.date}</TableCell>
        <TableCell>{record.students?.nis}</TableCell>
        <TableCell>{toTitleCase(record.students?.full_name || '')}</TableCell>
        <TableCell>
          <Select value={editedStatus} onValueChange={setEditedStatus}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hadir">Hadir</SelectItem>
              <SelectItem value="sakit">Sakit</SelectItem>
              <SelectItem value="izin">Izin</SelectItem>
              <SelectItem value="alpa">Alpa</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          <Input
            value={editedNotes}
            onChange={(e) => setEditedNotes(e.target.value)}
            placeholder="Catatan"
            className="w-full"
          />
        </TableCell>
        <TableCell>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              <Save className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setEditedStatus(record.status);
                setEditedNotes(record.notes || '');
              }}
            >
              <XIcon className="w-4 h-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>{record.date}</TableCell>
      <TableCell>{record.students?.nis}</TableCell>
      <TableCell>{toTitleCase(record.students?.full_name || '')}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {getStatusIcon(record.status)}
          <span className="capitalize">{record.status}</span>
        </div>
      </TableCell>
      <TableCell>{record.notes || '-'}</TableCell>
      <TableCell>
        <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
          <Edit2 className="w-4 h-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
};

const HomeroomAttendance = () => {
  const { user } = useAuth();
  const { selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();
  const [filterStartDate, setFilterStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterEndDate, setFilterEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState<Record<string, { status: string; notes: string }>>({});
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Fetch attendance day settings
  const { data: attendanceDaySettings } = useAttendanceDaySettings();
  const isDayAllowed = isAttendanceAllowedForDate(selectedDate, attendanceDaySettings);
  const activeDayNames = getActiveDayNames(attendanceDaySettings);

  // Quick filter handlers
  const handleThisWeek = () => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    setFilterStartDate(start.toISOString().split('T')[0]);
    setFilterEndDate(end.toISOString().split('T')[0]);
  };

  const handleThisMonth = () => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    setFilterStartDate(start.toISOString().split('T')[0]);
    setFilterEndDate(end.toISOString().split('T')[0]);
  };

  const handleMonthSelect = (month: string) => {
    setSelectedMonth(month);
    if (month && selectedYear) {
      const monthNum = parseInt(month);
      const year = parseInt(selectedYear.split('/')[0]);
      const date = new Date(year, monthNum - 1, 1);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      setFilterStartDate(start.toISOString().split('T')[0]);
      setFilterEndDate(end.toISOString().split('T')[0]);
    }
  };

  // Get teacher info (id + school_id)
  const { data: teacherInfo } = useQuery({
    queryKey: ['teacher-info-homeroom', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('id, school_id')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Get teacher's homeroom class
  const { data: homeroomClass } = useQuery({
    queryKey: ['homeroom-class', user?.id, selectedYear],
    queryFn: async () => {
      if (!selectedYear) return null;

      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (!teacher) return null;

      const { data: classData, error } = await supabase
        .from('classes')
        .select('*')
        .eq('homeroom_teacher_id', teacher.id)
        .eq('academic_year', selectedYear)
        .maybeSingle();

      if (error) throw error;
      return classData;
    },
    enabled: !!user?.id,
  });

  // Get students from homeroom class
  const { data: students } = useQuery({
    queryKey: ['homeroom-students', homeroomClass?.id],
    queryFn: async () => {
      if (!homeroomClass?.id) return [];

      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', homeroomClass.id)
        .order('full_name');

      if (error) throw error;
      return data;
    },
    enabled: !!homeroomClass?.id,
  });

  // Get attendance records for the homeroom class
  const { data: attendanceRecords } = useQuery({
    queryKey: ['homeroom-attendance', homeroomClass?.id, filterStartDate, filterEndDate],
    queryFn: async () => {
      if (!homeroomClass?.id) return [];

      const studentIds = students?.map((s) => s.id) || [];
      if (studentIds.length === 0) return [];

      const { data, error } = await supabase
        .from('attendance')
        .select(
          `
          *,
          students (
            id,
            full_name,
            nis
          )
        `
        )
        .in('student_id', studentIds)
        .gte('date', filterStartDate)
        .lte('date', filterEndDate)
        .order('date', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!homeroomClass?.id && !!students,
  });

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings-letterhead'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_school_settings_for_letterhead');
      if (error) throw error;
      return (data ?? null) as any;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Deduplicate records
  const deduplicatedRecords = useMemo(() => {
    if (!attendanceRecords) return [];

    const recordMap = new Map<string, any>();
    const sortedRecords = [...attendanceRecords].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    sortedRecords.forEach((record) => {
      const key = `${record.student_id}-${record.date}`;
      if (!recordMap.has(key)) {
        recordMap.set(key, record);
      }
    });

    return Array.from(recordMap.values());
  }, [attendanceRecords]);

  // Calculate statistics
  const stats = useMemo(() => {
    return {
      hadir: deduplicatedRecords.filter((r) => r.status === 'hadir').length,
      izin: deduplicatedRecords.filter((r) => r.status === 'izin').length,
      sakit: deduplicatedRecords.filter((r) => r.status === 'sakit').length,
      alpa: deduplicatedRecords.filter((r) => r.status === 'alpa').length,
    };
  }, [deduplicatedRecords]);

  // Calculate per-student statistics
  const studentStats = useMemo(() => {
    if (!students) return [];

    return students.map((student) => {
      const studentRecords = deduplicatedRecords.filter((r) => r.student_id === student.id);
      return {
        ...student,
        hadir: studentRecords.filter((r) => r.status === 'hadir').length,
        sakit: studentRecords.filter((r) => r.status === 'sakit').length,
        izin: studentRecords.filter((r) => r.status === 'izin').length,
        alpa: studentRecords.filter((r) => r.status === 'alpa').length,
        total: studentRecords.length,
      };
    });
  }, [students, deduplicatedRecords]);

  const chartData = [
    { name: 'Hadir', value: stats.hadir, color: COLORS.hadir },
    { name: 'Izin', value: stats.izin, color: COLORS.izin },
    { name: 'Sakit', value: stats.sakit, color: COLORS.sakit },
    { name: 'Alpa', value: stats.alpa, color: COLORS.alpa },
  ];

  const barChartData = [
    { status: 'Hadir', jumlah: stats.hadir },
    { status: 'Izin', jumlah: stats.izin },
    { status: 'Sakit', jumlah: stats.sakit },
    { status: 'Alpa', jumlah: stats.alpa },
  ];

  const handleExportPDF = async () => {
    if (!homeroomClass || !studentStats) return;

    if (!schoolSettings) {
      toast.error('Pengaturan sekolah belum dimuat. Silakan coba lagi.');
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4');

    const letterheadSettings = {
      school_name: schoolSettings.school_name || 'NAMA SEKOLAH',
      district_name: schoolSettings.district_name || undefined,
      district_font_size: schoolSettings.district_font_size || undefined,
      district_font_style: schoolSettings.district_font_style || undefined,
      district_line_spacing: schoolSettings.district_line_spacing || undefined,
      school_address: schoolSettings.school_address || undefined,
      school_phone: schoolSettings.school_phone || undefined,
      logo_url: schoolSettings.logo_url || undefined,
      logo_width: schoolSettings.logo_width || undefined,
      logo_height: schoolSettings.logo_height || undefined,
      logo_position_x: schoolSettings.logo_position_x || undefined,
      logo_position_y: schoolSettings.logo_position_y || undefined,
      right_logo_url: schoolSettings.right_logo_url || undefined,
      right_logo_width: schoolSettings.right_logo_width || undefined,
      right_logo_height: schoolSettings.right_logo_height || undefined,
      right_logo_position_x: schoolSettings.right_logo_position_x || undefined,
      right_logo_position_y: schoolSettings.right_logo_position_y || undefined,
      header_font_size: schoolSettings.header_font_size || undefined,
      header_font_style: schoolSettings.header_font_style || undefined,
      school_line_spacing: schoolSettings.school_line_spacing || undefined,
      subheader_font_size: schoolSettings.subheader_font_size || undefined,
      show_address: schoolSettings.show_address ?? true,
      show_phone: schoolSettings.show_phone ?? true,
      watermark_url: schoolSettings.watermark_url || undefined,
      watermark_opacity: schoolSettings.watermark_opacity || undefined,
      watermark_size: schoolSettings.watermark_size || undefined,
      watermark_position: schoolSettings.watermark_position || undefined,
      watermark_enabled: schoolSettings.watermark_enabled ?? false,
    };

    const startY = await addLetterheadToPDF(doc, letterheadSettings);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP KEHADIRAN SISWA WALI KELAS', doc.internal.pageSize.getWidth() / 2, startY, {
      align: 'center',
    });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Kelas: ${homeroomClass.name}`, 14, startY + 8);
    doc.text(`Periode: ${filterStartDate} s/d ${filterEndDate}`, 14, startY + 14);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, startY + 20);

    const startDate = new Date(filterStartDate);
    const endDate = new Date(filterEndDate);
    const dates: string[] = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().split('T')[0]);
    }

    const dayNumbers = dates.map((date) => new Date(date).getDate());

    const headers = ['No', 'NISN', 'Nama Siswa', ...dayNumbers.map((d) => d.toString()), 'H', 'S', 'I', 'A'];

    const attendanceMap = new Map<string, Map<string, string>>();
    deduplicatedRecords.forEach((record) => {
      if (!attendanceMap.has(record.student_id)) {
        attendanceMap.set(record.student_id, new Map());
      }
      const statusCode =
        record.status === 'hadir'
          ? 'H'
          : record.status === 'sakit'
          ? 'S'
          : record.status === 'izin'
          ? 'I'
          : 'A';
      attendanceMap.get(record.student_id)?.set(record.date, statusCode);
    });

    const tableData = studentStats.map((student, index) => {
      const studentAttendance = attendanceMap.get(student.id) || new Map();
      const row: any[] = [index + 1, student.nisn || student.nis, toTitleCase(student.full_name)];

      dates.forEach((date) => {
        row.push(studentAttendance.get(date) || '-');
      });

      row.push(
        student.hadir.toString(),
        student.sakit.toString(),
        student.izin.toString(),
        student.alpa.toString()
      );

      return row;
    });

    autoTable(doc, {
      startY: startY + 28,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [139, 92, 246],
        fontSize: 7,
        halign: 'center',
      },
      styles: {
        fontSize: 6,
        cellPadding: 1,
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 15 },
        2: { cellWidth: 30, halign: 'left' },
      },
      margin: { left: 10, right: 10 },
      didParseCell: (data) => {
        const cellValue = data.cell.raw;
        if (cellValue === 'H') {
          data.cell.styles.fillColor = [16, 185, 129];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        } else if (cellValue === 'S') {
          data.cell.styles.fillColor = [245, 158, 11];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        } else if (cellValue === 'I') {
          data.cell.styles.fillColor = [59, 130, 246];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        } else if (cellValue === 'A') {
          data.cell.styles.fillColor = [239, 68, 68];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY || startY + 28;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Keterangan:', 14, finalY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    doc.setFillColor(16, 185, 129);
    doc.rect(14, finalY + 13, 5, 5, 'F');
    doc.text('H = Hadir', 21, finalY + 17);

    doc.setFillColor(245, 158, 11);
    doc.rect(50, finalY + 13, 5, 5, 'F');
    doc.text('S = Sakit', 57, finalY + 17);

    doc.setFillColor(59, 130, 246);
    doc.rect(86, finalY + 13, 5, 5, 'F');
    doc.text('I = Izin', 93, finalY + 17);

    doc.setFillColor(239, 68, 68);
    doc.rect(120, finalY + 13, 5, 5, 'F');
    doc.text('A = Alpa', 127, finalY + 17);

    doc.save(`Rekap-Absensi-${homeroomClass.name}-${filterStartDate}-${filterEndDate}.pdf`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'hadir':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'sakit':
        return <Stethoscope className="w-4 h-4 text-orange-500" />;
      case 'izin':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'alpa':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const createAttendanceMutation = useMutation({
    mutationFn: async (attendanceList: any[]) => {
      console.log('=== START createAttendanceMutation ===');
      console.log('Upserting attendance records:', attendanceList.length);

      const { data, error } = await supabase
        .from('attendance')
        .upsert(attendanceList, {
          onConflict: 'schedule_id,student_id,date',
          ignoreDuplicates: false,
        })
        .select();

      console.log('Upsert result:', { data, error });

      if (error) {
        console.error('Upsert error:', error);
        throw error;
      }

      if (homeroomClass) {
        const channel = supabase.channel('attendance-notifications');
        await channel.send({
          type: 'broadcast',
          event: 'homeroom-attendance-filled',
          payload: {
            classId: homeroomClass.id,
            className: homeroomClass.name,
            date: selectedDate,
            teacherName: user?.email,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const selectedDayOfWeek = new Date(selectedDate).getDay();
      const { data: todaySchedules } = await supabase
        .from('schedules')
        .select('teacher_id, subject')
        .eq('class_id', homeroomClass?.id)
        .eq('day_of_week', selectedDayOfWeek);

      if (todaySchedules && todaySchedules.length > 0) {
        const notifications = todaySchedules
          .filter((s) => s.teacher_id)
          .map((schedule) => ({
            teacher_id: schedule.teacher_id,
            student_id: null,
            message: `Absensi jam pertama kelas ${homeroomClass?.name} telah diisi. Data tersedia sebagai default untuk ${schedule.subject}.`,
            type: 'attendance_ready',
            is_read: false,
          }));

        if (notifications.length > 0) {
          await supabase.from('notifications').insert(notifications);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homeroom-attendance'] });
      toast.success('✓ Absensi berhasil disimpan dan notifikasi dikirim ke guru mapel');
      setIsDialogOpen(false);
      setAttendanceData({});
    },
    onError: (error: any) => {
      console.error('Error saving attendance:', error);
      toast.error(`Gagal menyimpan absensi: ${error.message}`);
    },
  });

  const handleSubmitAttendance = async () => {
    console.log('=== START handleSubmitAttendance ===');

    if (!isAttendanceAllowedForDate(selectedDate, attendanceDaySettings)) {
      toast.error(
        `Absensi tidak dapat diisi pada hari yang dipilih. Hari yang diizinkan: ${activeDayNames.join(', ')}`
      );
      return;
    }

    if (!students || students.length === 0) {
      toast.error('Tidak ada siswa dalam kelas ini');
      return;
    }

    if (!homeroomClass) {
      toast.error('Data kelas tidak ditemukan');
      return;
    }

    if (!user?.id) {
      toast.error('User tidak teridentifikasi');
      return;
    }

    try {
      const selectedDayOfWeek = new Date(selectedDate).getDay();

      const { data: classSchedules, error: scheduleError } = await supabase
        .from('schedules')
        .select('id, start_time, subject')
        .eq('class_id', homeroomClass.id)
        .eq('day_of_week', selectedDayOfWeek)
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (scheduleError) throw scheduleError;

      let scheduleId = classSchedules?.id;

      if (!scheduleId) {
        const { data: anySchedule, error: anyScheduleError } = await supabase
          .from('schedules')
          .select('id, subject')
          .eq('class_id', homeroomClass.id)
          .limit(1)
          .maybeSingle();

        if (anyScheduleError) throw anyScheduleError;
        scheduleId = anySchedule?.id;

        if (!scheduleId) {
          toast.error('Tidak ada jadwal untuk kelas ini. Silakan tambahkan jadwal terlebih dahulu.');
          return;
        }
      }

      const attendanceList = students.map((student) => {
        const status = attendanceData[student.id]?.status || 'hadir';
        const notes = attendanceData[student.id]?.notes || null;

        return {
          schedule_id: scheduleId,
          student_id: student.id,
          date: selectedDate,
          status: status.toLowerCase(),
          notes: notes,
          created_by: user?.id,
        };
      });

      createAttendanceMutation.mutate(attendanceList);
    } catch (error: any) {
      console.error('Error preparing attendance:', error);
      toast.error(`Gagal mempersiapkan data absensi: ${error.message}`);
    }
  };

  const updateAttendanceStatus = (studentId: string, status: string) => {
    setAttendanceData((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], status },
    }));
  };

  const updateAttendanceNotes = (studentId: string, notes: string) => {
    setAttendanceData((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], notes },
    }));
  };

  const quickMarkAll = (status: string) => {
    if (!students) return;
    const newData: Record<string, { status: string; notes: string }> = {};
    students.forEach((s) => {
      newData[s.id] = { status, notes: '' };
    });
    setAttendanceData(newData);
    toast.success(`Semua siswa ditandai ${status}`);
  };

  if (!homeroomClass) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">Anda tidak terdaftar sebagai wali kelas.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        {/* HEADER */}
        <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
          <div>
            <h1 className="text-xl md:text-3xl font-bold gradient-text">Rekap Absensi Wali Kelas</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
              Rekap kehadiran siswa kelas {homeroomClass.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ImportAttendance />
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                if (open && !isDayAllowed) {
                  toast.error(
                    `Absensi tidak dapat diisi pada hari ini. Hari yang diizinkan: ${activeDayNames.join(', ')}`
                  );
                  return;
                }
                setIsDialogOpen(open);
              }}
            >
              <DialogTrigger asChild>
                <Button className="shadow-3d-hover color-shift" size="sm">
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Absensi Hari Ini</span>
                  <span className="sm:hidden">Absensi</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto glass-effect">
                <DialogHeader>
                  <DialogTitle className="gradient-text">Input Absensi Kelas {homeroomClass.name}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <Alert className="bg-purple-50 border-purple-200">
                    <Info className="h-4 w-4 text-purple-600" />
                    <AlertDescription className="text-sm text-purple-800">
                      <strong>Sistem Hybrid:</strong> Anda yang pertama mengabsen hari ini akan menjadi data default
                      untuk guru mata pelajaran. Mereka dapat mengubah status jika diperlukan.
                    </AlertDescription>
                  </Alert>

                  <div>
                    <Label>Tanggal</Label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={() => quickMarkAll('hadir')} variant="outline" size="sm">
                      Semua Hadir
                    </Button>
                    <Button onClick={() => quickMarkAll('sakit')} variant="outline" size="sm">
                      Semua Sakit
                    </Button>
                    <Button onClick={() => quickMarkAll('izin')} variant="outline" size="sm">
                      Semua Izin
                    </Button>
                    <Button onClick={() => quickMarkAll('alpa')} variant="outline" size="sm">
                      Semua Alpa
                    </Button>
                  </div>

                  <div className="border rounded-lg p-4 space-y-3 max-h-[50vh] overflow-y-auto">
                    {students?.map((student) => (
                      <Card key={student.id} className="shadow-md hover:shadow-lg transition-all">
                        <CardContent className="p-3 md:p-4">
                          <div className="flex flex-col gap-3">
                            <div>
                              <p className="font-semibold text-sm md:text-base">
                                {toTitleCase(student.full_name)}
                              </p>
                              <p className="text-xs md:text-sm text-muted-foreground">NIS: {student.nis}</p>
                            </div>

                            <RadioGroup
                              value={attendanceData[student.id]?.status || 'hadir'}
                              onValueChange={(value) => updateAttendanceStatus(student.id, value)}
                              className="flex flex-wrap gap-3 md:gap-4"
                            >
                              <div className="flex items-center space-x-1 md:space-x-2">
                                <RadioGroupItem value="hadir" id={`${student.id}-hadir`} />
                                <Label htmlFor={`${student.id}-hadir`} className="text-green-600 text-xs md:text-sm">
                                  Hadir
                                </Label>
                              </div>
                              <div className="flex items-center space-x-1 md:space-x-2">
                                <RadioGroupItem value="sakit" id={`${student.id}-sakit`} />
                                <Label htmlFor={`${student.id}-sakit`} className="text-orange-600 text-xs md:text-sm">
                                  Sakit
                                </Label>
                              </div>
                              <div className="flex items-center space-x-1 md:space-x-2">
                                <RadioGroupItem value="izin" id={`${student.id}-izin`} />
                                <Label htmlFor={`${student.id}-izin`} className="text-blue-600 text-xs md:text-sm">
                                  Izin
                                </Label>
                              </div>
                              <div className="flex items-center space-x-1 md:space-x-2">
                                <RadioGroupItem value="alpa" id={`${student.id}-alpa`} />
                                <Label htmlFor={`${student.id}-alpa`} className="text-red-600 text-xs md:text-sm">
                                  Alpa
                                </Label>
                              </div>
                            </RadioGroup>

                            <Textarea
                              placeholder="Catatan (opsional)"
                              value={attendanceData[student.id]?.notes || ''}
                              onChange={(e) => updateAttendanceNotes(student.id, e.target.value)}
                              className="text-sm"
                              rows={2}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Button
                    onClick={handleSubmitAttendance}
                    className="w-full shadow-3d-hover"
                    disabled={createAttendanceMutation.isPending}
                  >
                    {createAttendanceMutation.isPending ? 'Menyimpan...' : 'Simpan Absensi'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Data siswa & akun dipindah ke menu Akun Siswa (/akun-siswa) */}
        <Tabs defaultValue="attendance" className="space-y-4">
          {/* ============ TAB ABSENSI ============ */}
          <TabsContent value="attendance" className="space-y-4 md:space-y-6">
            {/* Filter Section */}
            <Card>
              <CardHeader className="pb-2 md:pb-6">
                <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                  <Calendar className="w-4 h-4 md:w-5 md:h-5" />
                  Filter Periode
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-6">
                <div className="space-y-4">
                  <div>
                    <Label className="mb-2 block text-xs md:text-sm">Filter Cepat</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleThisWeek} variant="outline" size="sm">
                        Minggu Ini
                      </Button>
                      <Button onClick={handleThisMonth} variant="outline" size="sm">
                        Bulan Ini
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs md:text-sm">Pilih Bulan</Label>
                    <Select value={selectedMonth} onValueChange={handleMonthSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih bulan..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Januari</SelectItem>
                        <SelectItem value="2">Februari</SelectItem>
                        <SelectItem value="3">Maret</SelectItem>
                        <SelectItem value="4">April</SelectItem>
                        <SelectItem value="5">Mei</SelectItem>
                        <SelectItem value="6">Juni</SelectItem>
                        <SelectItem value="7">Juli</SelectItem>
                        <SelectItem value="8">Agustus</SelectItem>
                        <SelectItem value="9">September</SelectItem>
                        <SelectItem value="10">Oktober</SelectItem>
                        <SelectItem value="11">November</SelectItem>
                        <SelectItem value="12">Desember</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
                    <div>
                      <Label className="text-xs md:text-sm">Tanggal Mulai</Label>
                      <Input
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => {
                          setFilterStartDate(e.target.value);
                          setSelectedMonth('');
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs md:text-sm">Tanggal Akhir</Label>
                      <Input
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => {
                          setFilterEndDate(e.target.value);
                          setSelectedMonth('');
                        }}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleExportPDF} className="w-full" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Export PDF
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Statistics Cards */}
            <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">Hadir</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                  <div className="text-xl md:text-2xl font-bold">{stats.hadir}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">Sakit</CardTitle>
                  <Stethoscope className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                  <div className="text-xl md:text-2xl font-bold">{stats.sakit}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">Izin</CardTitle>
                  <Clock className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                  <div className="text-xl md:text-2xl font-bold">{stats.izin}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
                  <CardTitle className="text-xs md:text-sm font-medium">Alpa</CardTitle>
                  <XCircle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                  <div className="text-xl md:text-2xl font-bold">{stats.alpa}</div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2 md:pb-6">
                  <CardTitle className="text-sm md:text-base">Distribusi Kehadiran</CardTitle>
                </CardHeader>
                <CardContent className="p-2 md:p-6">
                  <ResponsiveContainer width="100%" height={200} className="md:!h-[300px]">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={60}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 md:pb-6">
                  <CardTitle className="text-sm md:text-base">Grafik Kehadiran</CardTitle>
                </CardHeader>
                <CardContent className="p-2 md:p-6">
                  <ResponsiveContainer width="100%" height={200} className="md:!h-[300px]">
                    <BarChart data={barChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="jumlah" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Student Statistics Table */}
            <Card>
              <CardHeader className="pb-2 md:pb-6">
                <CardTitle className="text-sm md:text-base">Rekap Per Siswa</CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs md:text-sm">No</TableHead>
                        <TableHead className="text-xs md:text-sm">NIS</TableHead>
                        <TableHead className="text-xs md:text-sm">Nama</TableHead>
                        <TableHead className="text-center text-xs md:text-sm">Hadir</TableHead>
                        <TableHead className="text-center text-xs md:text-sm">Sakit</TableHead>
                        <TableHead className="text-center text-xs md:text-sm">Izin</TableHead>
                        <TableHead className="text-center text-xs md:text-sm">Alpa</TableHead>
                        <TableHead className="text-center text-xs md:text-sm">Total</TableHead>
                        <TableHead className="text-center text-xs md:text-sm">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentStats.map((student, index) => (
                        <TableRow key={student.id}>
                          <TableCell className="text-xs md:text-sm">{index + 1}</TableCell>
                          <TableCell className="text-xs md:text-sm">{student.nis}</TableCell>
                          <TableCell className="text-xs md:text-sm">
                            {toTitleCase(student.full_name)}
                          </TableCell>
                          <TableCell className="text-center text-xs md:text-sm">{student.hadir}</TableCell>
                          <TableCell className="text-center text-xs md:text-sm">{student.sakit}</TableCell>
                          <TableCell className="text-center text-xs md:text-sm">{student.izin}</TableCell>
                          <TableCell className="text-center text-xs md:text-sm">{student.alpa}</TableCell>
                          <TableCell className="text-center text-xs md:text-sm">{student.total}</TableCell>
                          <TableCell className="text-center text-xs md:text-sm">
                            {student.total > 0
                              ? `${((student.hadir / student.total) * 100).toFixed(1)}%`
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Recent Attendance Records */}
            <Card>
              <CardHeader className="pb-2 md:pb-6">
                <CardTitle className="text-sm md:text-base">Riwayat Absensi Terbaru</CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-6">
                <div className="overflow-x-auto">
                  <Table className="min-w-[500px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs md:text-sm">Tanggal</TableHead>
                        <TableHead className="text-xs md:text-sm">NIS</TableHead>
                        <TableHead className="text-xs md:text-sm">Nama</TableHead>
                        <TableHead className="text-xs md:text-sm">Status</TableHead>
                        <TableHead className="text-xs md:text-sm">Catatan</TableHead>
                        <TableHead className="text-xs md:text-sm">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deduplicatedRecords.slice(0, 20).map((record) => (
                        <EditableAttendanceRow
                          key={`${record.id}`}
                          record={record}
                          onUpdate={() => queryClient.invalidateQueries({ queryKey: ['homeroom-attendance'] })}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default HomeroomAttendance;