import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardCheck, Filter, Printer, Download, BarChart3, Users, UserX, FileText, Search, CheckCircle2, XCircle, Clock, Stethoscope, User, TrendingUp, Calendar, ArrowUpDown, ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { DuplicateAttendanceManager } from '@/components/DuplicateAttendanceManager';
import { useAttendanceDaySettings, isAttendanceAllowedForDate, getActiveDayNames } from '@/hooks/useAttendanceDaySettings';
import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF, addSignatureToPDF } from '@/lib/pdfLetterhead';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

const COLORS = {
  Hadir: '#10b981',
  Sakit: '#f59e0b',
  Izin: '#3b82f6',
  Alpa: '#ef4444',
};

const Attendance = () => {
  const { userRole, user } = useAuth();
  const { selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const isFullAccessRole = userRole === 'admin' || userRole === 'kesiswaan' || userRole === 'guru_piket';
  
  // Function to convert name to Title Case
  const toTitleCase = (name: string): string => {
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStartDate, setFilterStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterEndDate, setFilterEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterClass, setFilterClass] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [attendanceData, setAttendanceData] = useState<Record<string, { status: string; notes: string }>>({});
  const [sortField, setSortField] = useState<'date' | 'name' | 'class' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const itemsPerPage = 50;

  // Fetch attendance day settings
  const { data: attendanceDaySettings } = useAttendanceDaySettings();
  const isDayAllowed = isAttendanceAllowedForDate(selectedDate, attendanceDaySettings);
  const activeDayNames = getActiveDayNames(attendanceDaySettings);

  // Listen for real-time attendance notifications
  React.useEffect(() => {
    if (userRole !== 'teacher' || !user?.id) return;

    const channel = supabase.channel('attendance-notifications');
    
    channel
      .on('broadcast', { event: 'homeroom-attendance-filled' }, (payload) => {
        const { className, date } = payload.payload;
        toast.info(`📢 Absensi kelas ${className} untuk ${date} telah diisi. Data default tersedia!`, {
          duration: 8000,
        });
        
        // Refresh attendance records to show new data
        queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRole, user?.id, queryClient]);

  const { data: classes } = useQuery({
    queryKey: ['classes', selectedYear, userRole, user?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      
      // For teachers, only show classes they teach
      if (userRole === 'teacher' && user?.id) {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (!teacher) return [];
        
        // Get unique class IDs from teacher's schedules
        const { data: schedules, error: schedError } = await supabase
          .from('schedules')
          .select('class_id')
          .eq('teacher_id', teacher.id)
          .eq('academic_year', selectedYear);
        
        if (schedError) throw schedError;
        
        const classIds = Array.from(new Set(schedules?.map(s => s.class_id) || []));
        if (classIds.length === 0) return [];
        
        const { data, error } = await supabase
          .from('classes')
          .select('*')
          .in('id', classIds)
          .order('name');
        
        if (error) throw error;
        return data;
      }
      
      // For admin, show all classes
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('academic_year', selectedYear)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedYear && (isFullAccessRole || !!user?.id),
  });

  // Fetch unique subjects for filter
  const { data: subjects } = useQuery({
    queryKey: ['subjects', selectedYear, userRole, user?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      
      // For teachers, only show subjects they teach
      if (userRole === 'teacher' && user?.id) {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (!teacher) return [];
        
        const { data, error } = await supabase
          .from('schedules')
          .select('subject')
          .eq('teacher_id', teacher.id)
          .eq('academic_year', selectedYear)
          .order('subject');
        
        if (error) throw error;
        const uniqueSubjects = Array.from(new Set(data.map(s => s.subject)));
        return uniqueSubjects;
      }
      
      // For admin, show all subjects
      const { data, error } = await supabase
        .from('schedules')
        .select('subject')
        .eq('academic_year', selectedYear)
        .order('subject');
      if (error) throw error;
      // Get unique subjects
      const uniqueSubjects = Array.from(new Set(data.map(s => s.subject)));
      return uniqueSubjects;
    },
    enabled: !!selectedYear && (isFullAccessRole || !!user?.id),
  });

  const { data: schedules } = useQuery({
    queryKey: ['teacher-schedules', user?.id, userRole],
    queryFn: async () => {
      if (isFullAccessRole) {
        const { data, error } = await supabase
          .from('schedules')
          .select(`
            *,
            classes(id, name),
            teachers!inner(id, user_id)
          `)
          .order('day_of_week');
        if (error) throw error;
        return data;
      } else {
        const { data: teacher, error: teacherError } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();
        
        if (teacherError) throw teacherError;
        if (!teacher) {
          console.log('No teacher found for user:', user?.id);
          return [];
        }

        const { data, error } = await supabase
          .from('schedules')
          .select(`
            *,
            classes(id, name),
            teachers!inner(id, user_id)
          `)
          .eq('teacher_id', teacher.id)
          .eq('academic_year', selectedYear)
          .order('day_of_week');
        
        if (error) throw error;
        console.log('Teacher schedules:', data);
        return data;
      }
    },
    enabled: !!user?.id && !!userRole,
  });

  const { data: students } = useQuery({
    queryKey: ['schedule-students', selectedSchedule],
    queryFn: async () => {
      if (!selectedSchedule) return [];
      
      const { data: schedule } = await supabase
        .from('schedules')
        .select('class_id')
        .eq('id', selectedSchedule)
        .maybeSingle();
      
      if (!schedule) return [];

      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', schedule.class_id)
        .order('full_name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSchedule,
  });

  // Fetch existing attendance for the selected date and class (ANY schedule)
  const { data: existingAttendance } = useQuery({
    queryKey: ['existing-attendance', selectedSchedule, selectedDate],
    queryFn: async () => {
      if (!selectedSchedule || !selectedDate) return [];
      
      const { data: schedule } = await supabase
        .from('schedules')
        .select('class_id')
        .eq('id', selectedSchedule)
        .maybeSingle();
      
      if (!schedule) return [];

      // Get students in this class
      const { data: classStudents } = await supabase
        .from('students')
        .select('id')
        .eq('class_id', schedule.class_id);
      
      if (!classStudents) return [];
      const studentIds = classStudents.map(s => s.id);

      // Get ANY attendance for these students on this date (from any schedule)
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          students!inner(id, full_name, class_id),
          schedules(id, subject, start_time)
        `)
        .in('student_id', studentIds)
        .eq('date', selectedDate)
        .order('created_at', { ascending: true }); // Get earliest first
      
      if (error) throw error;
      
      // Return only the first attendance record per student (earliest)
      const firstRecords = new Map();
      data?.forEach(record => {
        if (!firstRecords.has(record.student_id)) {
          firstRecords.set(record.student_id, record);
        }
      });
      
      return Array.from(firstRecords.values());
    },
    enabled: !!selectedSchedule && !!selectedDate,
  });

  // Pre-populate attendance data from existing records
  React.useEffect(() => {
    if (existingAttendance && existingAttendance.length > 0) {
      const prePopulatedData: Record<string, { status: string; notes: string }> = {};
      existingAttendance.forEach(record => {
        const statusMap: Record<string, string> = {
          'hadir': 'Hadir',
          'sakit': 'Sakit',
          'izin': 'Izin',
          'alpa': 'Alpa',
        };
        prePopulatedData[record.student_id] = {
          status: statusMap[record.status] || 'Hadir',
          notes: record.notes || '',
        };
      });
      setAttendanceData(prePopulatedData);
    }
  }, [existingAttendance]);

  const { data: attendanceRecords } = useQuery({
    queryKey: ['attendance-records', filterStartDate, filterEndDate, filterClass, filterSubject, userRole, user?.id],
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

      // Get student IDs for the filtered class
      let studentIds: string[] | undefined;
      if (filterClass !== 'all') {
        const { data: classStudents } = await supabase
          .from('students')
          .select('id')
          .eq('class_id', filterClass);
        
        studentIds = classStudents?.map(s => s.id) || [];
        if (studentIds.length === 0) return [];
      }

      let query = supabase
        .from('attendance')
        .select(`
          *,
          students (
            id,
            full_name,
            nis,
            class_id,
            classes (
              name
            )
          ),
          schedules (
            subject
          )
        `)
        .gte('date', filterStartDate)
        .lte('date', filterEndDate);

      // Filter by teacher's schedules if user is a teacher
      if (userRole === 'teacher' && scheduleIds.length > 0) {
        query = query.in('schedule_id', scheduleIds);
      }

      // Filter by student IDs from the selected class
      if (studentIds) {
        query = query.in('student_id', studentIds);
      }
      
      const { data, error } = await query.order('date', { ascending: false });
      if (error) throw error;
      
      // Filter by subject after fetch (because of join complexity)
      if (filterSubject !== 'all' && data) {
        return data.filter(record => record.schedules?.subject === filterSubject);
      }
      
      return data;
    },
    enabled: !!userRole && (isFullAccessRole || !!user?.id),
  });

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    if (!searchQuery) return students;
    
    const query = searchQuery.toLowerCase();
    return students.filter(s => 
      toTitleCase(s.full_name).toLowerCase().includes(query) || 
      s.nis.toLowerCase().includes(query)
    );
  }, [students, searchQuery]);

  const attendanceStatsDialog = useMemo(() => {
    if (!students) return { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
    
    const stats = {
      hadir: 0,
      sakit: 0,
      izin: 0,
      alpa: 0,
      total: students.length
    };

    students.forEach(student => {
      const status = attendanceData[student.id]?.status || 'Hadir';
      if (status === 'Hadir') stats.hadir++;
      else if (status === 'Sakit') stats.sakit++;
      else if (status === 'Izin') stats.izin++;
      else if (status === 'Alpa') stats.alpa++;
    });

    return stats;
  }, [students, attendanceData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Hadir': return 'bg-green-500 hover:bg-green-600';
      case 'Sakit': return 'bg-orange-500 hover:bg-orange-600';
      case 'Izin': return 'bg-blue-500 hover:bg-blue-600';
      case 'Alpa': return 'bg-red-500 hover:bg-red-600';
      default: return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Hadir': return <CheckCircle2 className="w-5 h-5" />;
      case 'Sakit': return <Stethoscope className="w-5 h-5" />;
      case 'Izin': return <Clock className="w-5 h-5" />;
      case 'Alpa': return <XCircle className="w-5 h-5" />;
      default: return <User className="w-5 h-5" />;
    }
  };

  const quickMarkAll = (status: string) => {
    if (!students) return;
    const newData: Record<string, { status: string; notes: string }> = {};
    students.forEach(s => {
      newData[s.id] = { status, notes: '' };
    });
    setAttendanceData(newData);
    toast.success(`Semua siswa ditandai ${status}`);
  };
  const deduplicatedRecords = React.useMemo(() => {
    if (!attendanceRecords) return [];
    
    const recordMap = new Map<string, any>();
    
    // Sort by created_at descending to keep latest record
    const sortedRecords = [...attendanceRecords].sort((a, b) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
    
    // Keep only the most recent record per student per class per day
    sortedRecords.forEach(record => {
      const classId = record.students?.class_id || 'unknown';
      const key = `${record.student_id}-${classId}-${record.date}`;
      if (!recordMap.has(key)) {
        recordMap.set(key, record);
      }
    });
    
    return Array.from(recordMap.values());
  }, [attendanceRecords]);

  // Sort and paginate records
  const sortedRecords = React.useMemo(() => {
    const sorted = [...deduplicatedRecords].sort((a, b) => {
      let compareValue = 0;
      
      switch (sortField) {
        case 'date':
          compareValue = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'name':
          compareValue = toTitleCase(a.students?.full_name || '').localeCompare(toTitleCase(b.students?.full_name || ''));
          break;
        case 'class':
          compareValue = (a.students?.classes?.name || '').localeCompare(b.students?.classes?.name || '');
          break;
        case 'status':
          compareValue = (a.status || '').localeCompare(b.status || '');
          break;
      }
      
      return sortOrder === 'asc' ? compareValue : -compareValue;
    });
    
    return sorted;
  }, [deduplicatedRecords, sortField, sortOrder]);

  const paginatedRecords = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedRecords.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedRecords, currentPage]);

  const totalPages = Math.ceil(sortedRecords.length / itemsPerPage);

  const handleSort = (field: 'date' | 'name' | 'class' | 'status') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  // Quick filter handlers
  const handleThisWeek = () => {
    const today = new Date();
    const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday
    const end = endOfWeek(today, { weekStartsOn: 1 }); // Sunday
    setFilterStartDate(start.toISOString().split('T')[0]);
    setFilterEndDate(end.toISOString().split('T')[0]);
    setSelectedMonth('');
  };

  const handleThisMonth = () => {
    const today = new Date();
    const start = startOfMonth(today);
    const end = endOfMonth(today);
    setFilterStartDate(start.toISOString().split('T')[0]);
    setFilterEndDate(end.toISOString().split('T')[0]);
    setSelectedMonth('');
  };

  const handleMonthSelect = (month: string) => {
    if (!month) {
      setSelectedMonth('');
      return;
    }
    
    const [year, monthNum] = month.split('-');
    const start = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const end = endOfMonth(start);
    setFilterStartDate(start.toISOString().split('T')[0]);
    setFilterEndDate(end.toISOString().split('T')[0]);
    setSelectedMonth(month);
  };

  // Calculate statistics using deduplicated records
  const stats = React.useMemo(() => {
    return {
      hadir: deduplicatedRecords.filter(r => r.status === 'hadir').length,
      izin: deduplicatedRecords.filter(r => r.status === 'izin').length,
      sakit: deduplicatedRecords.filter(r => r.status === 'sakit').length,
      alpa: deduplicatedRecords.filter(r => r.status === 'alpa').length,
    };
  }, [deduplicatedRecords]);

  const absentByReason = React.useMemo(() => ({
    izin: deduplicatedRecords.filter(r => r.status === 'izin'),
    sakit: deduplicatedRecords.filter(r => r.status === 'sakit'),
    alpa: deduplicatedRecords.filter(r => r.status === 'alpa'),
  }), [deduplicatedRecords]);

  const chartData = [
    { name: 'Hadir', value: stats.hadir, color: COLORS.Hadir },
    { name: 'Izin', value: stats.izin, color: COLORS.Izin },
    { name: 'Sakit', value: stats.sakit, color: COLORS.Sakit },
    { name: 'Alpa', value: stats.alpa, color: COLORS.Alpa },
  ];

  const barChartData = [
    { status: 'Hadir', jumlah: stats.hadir },
    { status: 'Izin', jumlah: stats.izin },
    { status: 'Sakit', jumlah: stats.sakit },
    { status: 'Alpa', jumlah: stats.alpa },
  ];

  const createAttendanceMutation = useMutation({
    mutationFn: async (attendanceList: any[]) => {
      const { error } = await supabase
        .from('attendance')
        .upsert(attendanceList, { 
          onConflict: 'schedule_id,student_id,date',
          ignoreDuplicates: false 
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      toast.success('✓ Absensi berhasil disimpan');
      setIsDialogOpen(false);
      setAttendanceData({});
      setSelectedSchedule('');
      setSearchQuery('');
    },
    onError: (error: any) => {
      console.error('Error saving attendance:', error);
      toast.error(`Gagal menyimpan absensi: ${error.message || 'Terjadi kesalahan'}`);
    },
  });

  const handleSubmitAttendance = () => {
    if (!isAttendanceAllowedForDate(selectedDate, attendanceDaySettings)) {
      toast.error(`Absensi tidak dapat diisi pada hari yang dipilih. Hari yang diizinkan: ${activeDayNames.join(', ')}`);
      return;
    }

    if (!selectedSchedule || !user) {
      toast.error('Silakan pilih jadwal terlebih dahulu');
      return;
    }

    if (!students || students.length === 0) {
      toast.error('Tidak ada siswa dalam kelas ini');
      return;
    }

    const attendanceList = students.map((student) => {
      const status = attendanceData[student.id]?.status || 'Hadir';
      const notes = attendanceData[student.id]?.notes || '';
      
      // Convert to lowercase for database constraint
      const statusMap: Record<string, string> = {
        'Hadir': 'hadir',
        'Sakit': 'sakit',
        'Izin': 'izin',
        'Alpa': 'alpa',
      };
      
      return {
        schedule_id: selectedSchedule,
        student_id: student.id,
        date: selectedDate,
        status: statusMap[status] || 'hadir',
        notes: notes || null,
        created_by: user.id,
      };
    });

    console.log('Submitting attendance:', attendanceList);
    createAttendanceMutation.mutate(attendanceList);
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

  const handlePrint = () => {
    window.print();
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
    if (!deduplicatedRecords) return;

    const doc = new jsPDF();
    
    // Add letterhead
    const startY = await addLetterheadToPDF(doc, schoolSettings);
    
    // Report title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN KEHADIRAN SISWA', 105, startY, { align: 'center' });
    
    // Report info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: ${filterStartDate} s/d ${filterEndDate}`, 14, startY + 8);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, startY + 14);

    // Statistics
    doc.text(`Total Kehadiran: ${stats.hadir}`, 14, startY + 22);
    doc.text(`Sakit: ${stats.sakit}`, 60, startY + 22);
    doc.text(`Izin: ${stats.izin}`, 90, startY + 22);
    doc.text(`Alpa: ${stats.alpa}`, 120, startY + 22);

    // Clean notes from system tags
    const cleanNotes = (notes: string | null) => {
      if (!notes) return '-';
      // Remove system tags like [Absensi Pertama], [Default Wali Kelas], [Override dari...]
      return notes
        .replace(/\[Absensi Pertama\]/gi, '')
        .replace(/\[Default Wali Kelas.*?\]/gi, '')
        .replace(/\[Override dari.*?\]/gi, '')
        .trim() || '-';
    };

    // Table data using deduplicated records
    const tableData = deduplicatedRecords.map((r, index) => [
      index + 1,
      r.date,
      r.students?.nis || '-',
      toTitleCase(r.students?.full_name || '-'),
      r.students?.classes?.name || '-',
      r.status === 'hadir' ? 'Hadir' : r.status === 'sakit' ? 'Sakit' : r.status === 'izin' ? 'Izin' : 'Alpa',
      cleanNotes(r.notes)
    ]);

    autoTable(doc, {
      startY: startY + 30,
      head: [['No', 'Tanggal', 'NIS', 'Nama', 'Kelas', 'Status', 'Catatan']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] },
      styles: { fontSize: 8 },
    });

    // Save report data to database
    const finalY = (doc as any).lastAutoTable.finalY;
    const reportData = {
      verification: 'DOKUMEN VALID',
      type: 'Laporan Kehadiran Siswa',
      school: schoolSettings?.school_name,
      period: `${filterStartDate} s/d ${filterEndDate}`,
      stats: {
        hadir: stats.hadir,
        sakit: stats.sakit,
        izin: stats.izin,
        alpa: stats.alpa
      },
      students: deduplicatedRecords.map(r => ({
        nis: r.students?.nis,
        nama: toTitleCase(r.students?.full_name || ''),
        kelas: r.students?.classes?.name,
        status: r.status,
        tanggal: r.date,
        catatan: cleanNotes(r.notes)
      })),
      printDate: new Date().toISOString(),
      totalRecords: deduplicatedRecords.length
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
        report_type: 'attendance',
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

    doc.save(`kehadiran-${filterStartDate}-${filterEndDate}.pdf`);
    toast.success('Laporan berhasil dicetak dengan QR code verifikasi');
  };

  const handleExportRekapPDF = async () => {
    if (!deduplicatedRecords) return;

    // Get unique students from deduplicated records
    const studentMap = new Map();
    deduplicatedRecords.forEach(record => {
      if (record.students && !studentMap.has(record.student_id)) {
        studentMap.set(record.student_id, record.students);
      }
    });
    const students = Array.from(studentMap.values());

    if (students.length === 0) {
      toast.error('Tidak ada data siswa untuk diekspor');
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape for more columns
    const startY = await addLetterheadToPDF(doc, schoolSettings);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP KEHADIRAN SISWA PER MATA PELAJARAN', doc.internal.pageSize.getWidth() / 2, startY, { align: 'center' });
    
    // Get class and subject info from filter
    const selectedSchedule = filterSubject !== 'all' ? schedules?.find(s => s.id === filterSubject) : null;
    const classInfo = filterClass !== 'all' 
      ? classes?.find(c => c.id === filterClass)?.name 
      : selectedSchedule 
        ? classes?.find(c => c.id === selectedSchedule.class_id)?.name
        : 'Semua Kelas';
    const subjectInfo = selectedSchedule?.subject || 'Semua Mata Pelajaran';
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Kelas: ${classInfo}`, 14, startY + 8);
    doc.text(`Mata Pelajaran: ${subjectInfo}`, 14, startY + 14);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: ${filterStartDate} s/d ${filterEndDate}`, 14, startY + 20);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, startY + 26);

    // Generate dates for the selected period
    const startDate = new Date(filterStartDate);
    const endDate = new Date(filterEndDate);
    const dates: string[] = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().split('T')[0]);
    }

    // Get day numbers for header (1-31)
    const dayNumbers = dates.map(date => new Date(date).getDate());

    // Build table headers: No, NISN, Nama, [1-31], Hadir, Sakit, Izin, Alfa
    const headers = ['No', 'NISN', 'Nama Siswa', ...dayNumbers.map(d => d.toString()), 'H', 'S', 'I', 'A'];

    // Build attendance map for quick lookup
    const attendanceMap = new Map<string, Map<string, string>>();
    deduplicatedRecords.forEach(record => {
      if (!attendanceMap.has(record.student_id)) {
        attendanceMap.set(record.student_id, new Map());
      }
      const statusCode = record.status === 'hadir' ? 'H' : 
                         record.status === 'sakit' ? 'S' : 
                         record.status === 'izin' ? 'I' : 'A';
      attendanceMap.get(record.student_id)?.set(record.date, statusCode);
    });

    // Calculate per-student statistics
    const studentStats = students.map(student => {
      const studentRecords = deduplicatedRecords.filter(r => r.student_id === student.id);
      return {
        id: student.id,
        nisn: student.nisn || student.nis,
        nis: student.nis,
        full_name: student.full_name,
        hadir: studentRecords.filter(r => r.status === 'hadir').length,
        sakit: studentRecords.filter(r => r.status === 'sakit').length,
        izin: studentRecords.filter(r => r.status === 'izin').length,
        alpa: studentRecords.filter(r => r.status === 'alpa').length,
      };
    });

    // Build table body
    const tableData = studentStats.map((student, index) => {
      const studentAttendance = attendanceMap.get(student.id) || new Map();
      const row = [
        index + 1,
        student.nisn,
        toTitleCase(student.full_name)
      ];

      // Add attendance for each date
      dates.forEach(date => {
        row.push(studentAttendance.get(date) || '-');
      });

      // Add summary columns
      row.push(
        student.hadir.toString(),
        student.sakit.toString(),
        student.izin.toString(),
        student.alpa.toString()
      );

      return row;
    });

    autoTable(doc, {
      startY: startY + 34,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [139, 92, 246],
        fontSize: 7,
        halign: 'center'
      },
      styles: { 
        fontSize: 6,
        cellPadding: 1,
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 8 },  // No
        1: { cellWidth: 15 }, // NISN
        2: { cellWidth: 30, halign: 'left' }, // Nama
        // Date columns will auto-size
      },
      margin: { left: 10, right: 10 },
      didParseCell: (data) => {
        const cellValue = data.cell.raw;
        // Apply color coding for attendance status cells (H, S, I, A)
        if (cellValue === 'H') {
          data.cell.styles.fillColor = [16, 185, 129]; // Green for Hadir
          data.cell.styles.textColor = [255, 255, 255]; // White text
          data.cell.styles.fontStyle = 'bold';
        } else if (cellValue === 'S') {
          data.cell.styles.fillColor = [245, 158, 11]; // Orange for Sakit
          data.cell.styles.textColor = [255, 255, 255]; // White text
          data.cell.styles.fontStyle = 'bold';
        } else if (cellValue === 'I') {
          data.cell.styles.fillColor = [59, 130, 246]; // Blue for Izin
          data.cell.styles.textColor = [255, 255, 255]; // White text
          data.cell.styles.fontStyle = 'bold';
        } else if (cellValue === 'A') {
          data.cell.styles.fillColor = [239, 68, 68]; // Red for Alpa
          data.cell.styles.textColor = [255, 255, 255]; // White text
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // Add legend at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || startY + 34;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Keterangan:', 14, finalY + 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    
    // Green box for Hadir
    doc.setFillColor(16, 185, 129);
    doc.rect(14, finalY + 13, 5, 5, 'F');
    doc.text('H = Hadir', 21, finalY + 17);
    
    // Orange box for Sakit
    doc.setFillColor(245, 158, 11);
    doc.rect(50, finalY + 13, 5, 5, 'F');
    doc.text('S = Sakit', 57, finalY + 17);
    
    // Blue box for Izin
    doc.setFillColor(59, 130, 246);
    doc.rect(86, finalY + 13, 5, 5, 'F');
    doc.text('I = Izin', 93, finalY + 17);
    
    // Red box for Alpa
    doc.setFillColor(239, 68, 68);
    doc.rect(120, finalY + 13, 5, 5, 'F');
    doc.text('A = Alpa', 127, finalY + 17);

    doc.save(`Rekap-Absensi-Mapel-${filterStartDate}-${filterEndDate}.pdf`);
    toast.success('Rekap absensi berhasil dicetak');
  };

  const handleExport = () => {
    if (!deduplicatedRecords) return;
    
    const cleanNotesForExport = (notes: string | null) => {
      if (!notes) return '';
      return notes
        .replace(/\[Absensi Pertama\]/gi, '')
        .replace(/\[Default Wali Kelas.*?\]/gi, '')
        .replace(/\[Override dari.*?\]/gi, '')
        .trim();
    };
    
    const csvContent = [
      ['Tanggal', 'NIS', 'Nama', 'Kelas', 'Status', 'Catatan'].join(','),
      ...deduplicatedRecords.map(r => [
        r.date,
        r.students?.nis || '',
        toTitleCase(r.students?.full_name || ''),
        r.students?.classes?.name || '',
        r.status,
        cleanNotesForExport(r.notes)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `absensi-${filterStartDate}-${filterEndDate}.csv`;
    a.click();
  };

  const handlePrintAbsent = async () => {
    if (!absentByReason) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Add letterhead with full settings including watermark
    const letterheadSettings = schoolSettings ? {
      school_name: schoolSettings.school_name,
      district_name: schoolSettings.district_name || '',
      school_address: schoolSettings.school_address || '',
      school_phone: schoolSettings.school_phone || '',
      logo_url: schoolSettings.logo_url || '',
      right_logo_url: schoolSettings.right_logo_url || '',
      header_font_size: schoolSettings.header_font_size || 14,
      subheader_font_size: schoolSettings.subheader_font_size || 10,
      district_font_size: schoolSettings.district_font_size || 12,
      district_font_style: schoolSettings.district_font_style || 'bold',
      school_line_spacing: schoolSettings.school_line_spacing || 6,
      district_line_spacing: schoolSettings.district_line_spacing || 5,
      logo_width: schoolSettings.logo_width || 20,
      logo_height: schoolSettings.logo_height || 20,
      logo_position_x: schoolSettings.logo_position_x || 14,
      logo_position_y: schoolSettings.logo_position_y || 10,
      right_logo_width: schoolSettings.right_logo_width || 20,
      right_logo_height: schoolSettings.right_logo_height || 20,
      right_logo_position_x: schoolSettings.right_logo_position_x || pageWidth - 34,
      right_logo_position_y: schoolSettings.right_logo_position_y || 10,
      show_address: schoolSettings.show_address ?? true,
      show_phone: schoolSettings.show_phone ?? true,
      watermark_enabled: schoolSettings.watermark_enabled ?? false,
      watermark_url: schoolSettings.watermark_url || '',
      watermark_opacity: schoolSettings.watermark_opacity || 10,
      watermark_size: schoolSettings.watermark_size || 100,
      watermark_position: schoolSettings.watermark_position || 'center',
    } : null;
    
    const startY = await addLetterheadToPDF(doc, letterheadSettings);
    
    // Report title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP SISWA TIDAK HADIR', pageWidth / 2, startY + 2, { align: 'center' });
    
    // Report info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const infoY = startY + 12;
    doc.text(`Periode: ${filterStartDate} s/d ${filterEndDate}`, 14, infoY);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, pageWidth - 14, infoY, { align: 'right' });

    // Summary box
    const summaryY = infoY + 8;
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(14, summaryY, pageWidth - 28, 12, 2, 2, 'FD');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const totalAbsent = absentByReason.izin.length + absentByReason.sakit.length + absentByReason.alpa.length;
    const boxCenterY = summaryY + 7;
    doc.text(`Total Tidak Hadir: ${totalAbsent}`, 20, boxCenterY);
    doc.setTextColor(234, 179, 8);
    doc.text(`Izin: ${absentByReason.izin.length}`, 70, boxCenterY);
    doc.setTextColor(59, 130, 246);
    doc.text(`Sakit: ${absentByReason.sakit.length}`, 100, boxCenterY);
    doc.setTextColor(239, 68, 68);
    doc.text(`Alpa: ${absentByReason.alpa.length}`, 130, boxCenterY);
    doc.setTextColor(0, 0, 0);

    // Combine all absent students and sort by class name then student name
    const allAbsent = [
      ...absentByReason.izin.map(r => ({ ...r, type: 'Izin' })),
      ...absentByReason.sakit.map(r => ({ ...r, type: 'Sakit' })),
      ...absentByReason.alpa.map(r => ({ ...r, type: 'Alpa' })),
    ].sort((a, b) => {
      // Sort by class name first
      const classA = a.students?.classes?.name || '';
      const classB = b.students?.classes?.name || '';
      const classCompare = classA.localeCompare(classB, 'id');
      if (classCompare !== 0) return classCompare;
      
      // Then sort by student name
      const nameA = a.students?.full_name || '';
      const nameB = b.students?.full_name || '';
      return nameA.localeCompare(nameB, 'id');
    });

    // Clean notes from system tags
    const cleanNotesForAbsent = (notes: string | null) => {
      if (!notes) return '-';
      return notes
        .replace(/\[Absensi Pertama\]/gi, '')
        .replace(/\[Default Wali Kelas.*?\]/gi, '')
        .replace(/\[Override dari.*?\]/gi, '')
        .trim() || '-';
    };

    const tableData = allAbsent.map((r, index) => [
      index + 1,
      r.date,
      r.students?.nis || '-',
      toTitleCase(r.students?.full_name || '-'),
      r.students?.classes?.name || '-',
      r.type,
      cleanNotesForAbsent(r.notes)
    ]);

    autoTable(doc, {
      startY: summaryY + 18,
      head: [['No', 'Tanggal', 'NIS', 'Nama Siswa', 'Kelas', 'Status', 'Catatan']],
      body: tableData,
      theme: 'striped',
      headStyles: { 
        fillColor: [239, 68, 68],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'center', cellWidth: 22 },
        2: { halign: 'center', cellWidth: 20 },
        3: { cellWidth: 45 },
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'center', cellWidth: 18 },
        6: { cellWidth: 'auto' }
      },
      styles: { 
        fontSize: 8,
        cellPadding: 2
      },
      alternateRowStyles: {
        fillColor: [254, 242, 242]
      }
    });

    // Save report data to database
    const finalY = (doc as any).lastAutoTable.finalY;
    const reportData = {
      verification: 'DOKUMEN VALID',
      type: 'Rekap Siswa Tidak Hadir',
      school: schoolSettings?.school_name,
      period: `${filterStartDate} s/d ${filterEndDate}`,
      summary: {
        totalAbsent: absentByReason.izin.length + absentByReason.sakit.length + absentByReason.alpa.length,
        izin: absentByReason.izin.length,
        sakit: absentByReason.sakit.length,
        alpa: absentByReason.alpa.length
      },
      students: allAbsent.map(r => ({
        nis: r.students?.nis,
        nama: toTitleCase(r.students?.full_name || ''),
        kelas: r.students?.classes?.name,
        status: r.type,
        tanggal: r.date,
        catatan: cleanNotesForAbsent(r.notes)
      })),
      printDate: new Date().toISOString(),
      totalRecords: allAbsent.length
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
        report_type: 'absent_recap',
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

    doc.save(`siswa-tidak-hadir-${filterStartDate}-${filterEndDate}.pdf`);
    toast.success('Laporan berhasil dicetak dengan QR code verifikasi');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">Absensi</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              {isFullAccessRole ? 'Pantau absensi semua kelas' : 'Isi absensi siswa'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isFullAccessRole && <DuplicateAttendanceManager />}
            <Button variant="outline" onClick={handlePrint} className="gap-2" size="sm">
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Cetak</span>
            </Button>
            <Button variant="outline" onClick={handlePrintAbsent} className="gap-2" size="sm">
              <UserX className="h-4 w-4" />
              <span className="hidden sm:inline">Tidak Hadir</span>
            </Button>
            <Button variant="outline" onClick={handleExportPDF} className="gap-2" size="sm">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button variant="outline" onClick={handleExportRekapPDF} className="gap-2" size="sm">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Rekap</span>
            </Button>
            <Button variant="outline" onClick={handleExport} className="gap-2" size="sm">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            {userRole === 'teacher' && (
              <>
                {/* Trigger Button */}
                <Button 
                  className="bg-gradient-primary gap-2"
                  onClick={() => {
                    if (!isDayAllowed) {
                      toast.error(`Absensi tidak dapat diisi pada hari ini. Hari yang diizinkan: ${activeDayNames.join(', ')}`);
                      return;
                    }
                    setIsDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Isi Absensi</span>
                  <span className="sm:hidden">Absen</span>
                </Button>

                {/* Mobile: Full-screen Drawer */}
                {isMobile ? (
                  <Drawer open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DrawerContent className="max-h-[90vh] mx-auto">
                      {/* Header with close button */}
                      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-primary" />
                          <span className="font-bold text-base">Isi Absensi</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setIsDialogOpen(false)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Content - Scrollable */}
                      <div className="flex-1 overflow-y-auto px-4 py-3 max-h-[calc(90vh-140px)]">
                        <div className="space-y-3">
                          {/* Schedule and Date Selection - Stacked on mobile */}
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-sm font-semibold">Jadwal Pelajaran</Label>
                              <Select value={selectedSchedule} onValueChange={setSelectedSchedule}>
                                <SelectTrigger className="h-11 border-2 text-sm w-full">
                                  <SelectValue placeholder="Pilih jadwal" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[250px] w-[calc(100vw-32px)]" position="popper" side="bottom" align="start">
                                  {schedules?.map((schedule) => (
                                    <SelectItem key={schedule.id} value={schedule.id} className="py-2.5">
                                      <div className="flex flex-col">
                                        <span className="font-medium text-sm">{schedule.classes?.name} - {schedule.subject}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {schedule.start_time} - {schedule.end_time}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-sm font-semibold">Tanggal</Label>
                              <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="flex h-11 w-full rounded-md border-2 border-input bg-background px-3 py-2 text-sm"
                              />
                            </div>
                          </div>

                          {selectedSchedule && students && students.length > 0 && (
                            <>
                              {/* Compact Stats - 2x2 grid on mobile */}
                              <div className="grid grid-cols-4 gap-2">
                                <div className="bg-muted/50 rounded-lg p-2 text-center">
                                  <p className="text-lg font-bold">{attendanceStatsDialog.total}</p>
                                  <p className="text-[10px] text-muted-foreground">Total</p>
                                </div>
                                <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                                  <p className="text-lg font-bold text-green-700">{attendanceStatsDialog.hadir}</p>
                                  <p className="text-[10px] text-green-700">Hadir</p>
                                </div>
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                                  <p className="text-lg font-bold text-orange-700">{attendanceStatsDialog.sakit}</p>
                                  <p className="text-[10px] text-orange-700">Sakit</p>
                                </div>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center">
                                  <p className="text-lg font-bold text-blue-700">{attendanceStatsDialog.izin}</p>
                                  <p className="text-[10px] text-blue-700">Izin</p>
                                </div>
                              </div>

                              {/* Quick Actions - Horizontal scroll */}
                              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Hadir')} className="shrink-0 gap-1 h-9">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Semua Hadir
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Sakit')} className="shrink-0 gap-1 h-9">
                                  <Stethoscope className="w-3 h-3" />
                                  Semua Sakit
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Izin')} className="shrink-0 gap-1 h-9">
                                  <Clock className="w-3 h-3" />
                                  Semua Izin
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Alpa')} className="shrink-0 gap-1 h-9">
                                  <XCircle className="w-3 h-3" />
                                  Semua Alpa
                                </Button>
                              </div>

                              {/* Search */}
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                  placeholder="Cari siswa..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm"
                                />
                              </div>

                              {/* Student List - Mobile optimized cards */}
                              <div className="space-y-3">
                                {filteredStudents.map((student) => {
                                  const currentStatus = attendanceData[student.id]?.status || 'Hadir';
                                  return (
                                    <Card key={student.id} className="border shadow-sm">
                                      <CardContent className="p-3 space-y-3">
                                        {/* Student Info Row */}
                                        <div className="flex items-center gap-3">
                                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${getStatusColor(currentStatus)}`}>
                                            {toTitleCase(student.full_name).charAt(0)}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <h3 className="font-medium text-sm truncate">{toTitleCase(student.full_name)}</h3>
                                            <p className="text-xs text-muted-foreground">NIS: {student.nis}</p>
                                          </div>
                                        </div>

                                        {/* Status Buttons - Grid 4 columns */}
                                        <div className="grid grid-cols-4 gap-1.5">
                                          {['Hadir', 'Sakit', 'Izin', 'Alpa'].map((status) => (
                                            <Button
                                              key={status}
                                              size="sm"
                                              variant={currentStatus === status ? 'default' : 'outline'}
                                              className={`h-9 text-xs px-1 ${
                                                currentStatus === status 
                                                  ? `${getStatusColor(status)} text-white border-0` 
                                                  : ''
                                              }`}
                                              onClick={() => updateAttendanceStatus(student.id, status)}
                                            >
                                              {status === 'Hadir' && 'H'}
                                              {status === 'Sakit' && 'S'}
                                              {status === 'Izin' && 'I'}
                                              {status === 'Alpa' && 'A'}
                                            </Button>
                                          ))}
                                        </div>

                                        {/* Notes - Only show for non-Hadir */}
                                        {currentStatus !== 'Hadir' && (
                                          <input
                                            placeholder="Catatan..."
                                            value={attendanceData[student.id]?.notes || ''}
                                            onChange={(e) => updateAttendanceNotes(student.id, e.target.value)}
                                            className="flex h-8 w-full rounded border border-input bg-background px-2 py-1 text-xs"
                                          />
                                        )}
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </div>

                              {filteredStudents.length === 0 && (
                                <div className="text-center py-8">
                                  <Search className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                                  <p className="text-sm text-muted-foreground">Tidak ada siswa ditemukan</p>
                                </div>
                              )}
                            </>
                          )}

                          {selectedSchedule && (!students || students.length === 0) && (
                            <div className="text-center py-8 bg-muted/30 rounded-lg">
                              <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground">Tidak ada siswa dalam kelas ini</p>
                            </div>
                          )}

                          {!selectedSchedule && (
                            <div className="text-center py-8 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border-2 border-dashed border-primary/30">
                              <TrendingUp className="h-12 w-12 mx-auto text-primary mb-2" />
                              <p className="font-semibold mb-1">Pilih Jadwal</p>
                              <p className="text-xs text-muted-foreground">Pilih jadwal pelajaran untuk mulai absensi</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Footer - Fixed at bottom */}
                      <div className="p-4 border-t bg-background sticky bottom-0">
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setIsDialogOpen(false);
                              setAttendanceData({});
                              setSelectedSchedule('');
                              setSearchQuery('');
                            }}
                            className="flex-1"
                          >
                            Batal
                          </Button>
                          <Button
                            onClick={handleSubmitAttendance}
                            disabled={!selectedSchedule || !students || students.length === 0 || createAttendanceMutation.isPending}
                            className="flex-1 bg-gradient-primary"
                          >
                            {createAttendanceMutation.isPending ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                Menyimpan...
                              </>
                            ) : (
                              <>
                                <ClipboardCheck className="mr-2 h-4 w-4" />
                                Simpan
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </DrawerContent>
                  </Drawer>
                ) : (
                  /* Desktop: Dialog */
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-7xl max-h-[95vh] overflow-hidden flex flex-col p-0">
                      <DialogHeader className="p-6 pb-4 border-b">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                          <Calendar className="w-6 h-6 text-primary" />
                          Isi Absensi Siswa
                        </DialogTitle>
                      </DialogHeader>
                      
                      <div className="flex-1 overflow-y-auto px-6">
                        <div className="space-y-6 py-4">
                          <Alert className="bg-blue-50 border-blue-200">
                            <Info className="h-4 w-4 text-blue-600" />
                            <AlertDescription className="text-sm text-blue-800">
                              <strong>Sistem Hybrid:</strong> Guru yang mengabsen pertama kali (wali kelas/guru mapel) akan menjadi data default untuk guru lainnya. Status dapat diubah jika berbeda.
                            </AlertDescription>
                          </Alert>

                          {/* Schedule Selection */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold">Jadwal Pelajaran</Label>
                              <Select value={selectedSchedule} onValueChange={setSelectedSchedule}>
                                <SelectTrigger className="h-12 border-2">
                                  <SelectValue placeholder="Pilih jadwal pelajaran" />
                                </SelectTrigger>
                                <SelectContent>
                                  {schedules?.map((schedule) => (
                                    <SelectItem key={schedule.id} value={schedule.id}>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{schedule.classes?.name} - {schedule.subject}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {schedule.start_time} - {schedule.end_time}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold">Tanggal</Label>
                              <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="flex h-12 w-full rounded-md border-2 border-input bg-background px-3 py-2 text-sm"
                              />
                            </div>
                          </div>

                          {selectedSchedule && students && students.length > 0 && (
                            <>
                              {/* Previous Attendance Info */}
                              {existingAttendance && existingAttendance.length > 0 && (
                                <Card className="bg-blue-50 border-blue-200">
                                  <CardContent className="p-4">
                                    <div className="flex items-start gap-3">
                                      <div className="bg-blue-500 p-2 rounded-lg">
                                        <ClipboardCheck className="w-5 h-5 text-white" />
                                      </div>
                                      <div className="flex-1">
                                        <h3 className="font-semibold text-blue-900 mb-2">Data Absensi Ditemukan</h3>
                                        <p className="text-sm text-blue-700 mb-2">
                                          Ada absensi yang sudah diinput untuk tanggal {selectedDate}. Data akan dimuat sebagai default.
                                        </p>
                                        <div className="text-xs text-blue-600">
                                          {existingAttendance.length} siswa sudah memiliki data absensi
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              )}

                              {/* Stats Dashboard */}
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <Card className="bg-muted/50 border-none">
                                  <CardContent className="p-4 flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Total</p>
                                      <p className="text-2xl font-bold">{attendanceStatsDialog.total}</p>
                                    </div>
                                    <User className="w-8 h-8 text-muted-foreground" />
                                  </CardContent>
                                </Card>
                                <Card className="bg-green-50 border-green-200 border">
                                  <CardContent className="p-4 flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-green-700">Hadir</p>
                                      <p className="text-2xl font-bold text-green-700">{attendanceStatsDialog.hadir}</p>
                                    </div>
                                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                                  </CardContent>
                                </Card>
                                <Card className="bg-orange-50 border-orange-200 border">
                                  <CardContent className="p-4 flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-orange-700">Sakit</p>
                                      <p className="text-2xl font-bold text-orange-700">{attendanceStatsDialog.sakit}</p>
                                    </div>
                                    <Stethoscope className="w-8 h-8 text-orange-600" />
                                  </CardContent>
                                </Card>
                                <Card className="bg-blue-50 border-blue-200 border">
                                  <CardContent className="p-4 flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-blue-700">Izin</p>
                                      <p className="text-2xl font-bold text-blue-700">{attendanceStatsDialog.izin}</p>
                                    </div>
                                    <Clock className="w-8 h-8 text-blue-600" />
                                  </CardContent>
                                </Card>
                                <Card className="bg-red-50 border-red-200 border">
                                  <CardContent className="p-4 flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-red-700">Alpa</p>
                                      <p className="text-2xl font-bold text-red-700">{attendanceStatsDialog.alpa}</p>
                                    </div>
                                    <XCircle className="w-8 h-8 text-red-600" />
                                  </CardContent>
                                </Card>
                              </div>

                              {/* Quick Actions */}
                              <div className="flex flex-wrap gap-2 p-4 bg-muted/30 rounded-lg">
                                <p className="text-sm font-semibold w-full mb-2">Quick Actions:</p>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Hadir')} className="gap-2">
                                  <CheckCircle2 className="w-4 h-4" />
                                  Semua Hadir
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Sakit')} className="gap-2">
                                  <Stethoscope className="w-4 h-4" />
                                  Semua Sakit
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Izin')} className="gap-2">
                                  <Clock className="w-4 h-4" />
                                  Semua Izin
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Alpa')} className="gap-2">
                                  <XCircle className="w-4 h-4" />
                                  Semua Alpa
                                </Button>
                              </div>

                              {/* Search */}
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <input
                                  placeholder="Cari nama atau NIS siswa..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="flex h-12 w-full rounded-md border-2 border-input bg-background px-3 py-2 pl-10 text-sm"
                                />
                              </div>

                              {/* Student Cards Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredStudents.map((student, index) => {
                                  const currentStatus = attendanceData[student.id]?.status || 'Hadir';
                                  return (
                                    <Card 
                                      key={student.id} 
                                      className="card-hover border-2 transition-all duration-300 animate-scale-in"
                                      style={{ animationDelay: `${index * 30}ms` }}
                                    >
                                      <CardContent className="p-4 space-y-3">
                                        {/* Student Info */}
                                        <div className="flex items-start gap-3">
                                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${getStatusColor(currentStatus)}`}>
                                            {toTitleCase(student.full_name).charAt(0).toUpperCase()}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-base truncate">{toTitleCase(student.full_name)}</h3>
                                            <p className="text-sm text-muted-foreground">NIS: {student.nis}</p>
                                          </div>
                                        </div>

                                        {/* Status Buttons */}
                                        <div className="grid grid-cols-2 gap-2">
                                          {['Hadir', 'Sakit', 'Izin', 'Alpa'].map((status) => (
                                            <Button
                                              key={status}
                                              size="sm"
                                              variant={currentStatus === status ? 'default' : 'outline'}
                                              className={`gap-2 transition-all ${
                                                currentStatus === status 
                                                  ? `${getStatusColor(status)} text-white` 
                                                  : 'hover:border-primary'
                                              }`}
                                              onClick={() => updateAttendanceStatus(student.id, status)}
                                            >
                                              {getStatusIcon(status)}
                                              {status}
                                            </Button>
                                          ))}
                                        </div>

                                        {/* Notes Input */}
                                        {currentStatus !== 'Hadir' && (
                                          <input
                                            placeholder="Catatan (opsional)"
                                            value={attendanceData[student.id]?.notes || ''}
                                            onChange={(e) => updateAttendanceNotes(student.id, e.target.value)}
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm animate-fade-in"
                                          />
                                        )}
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </div>

                              {filteredStudents.length === 0 && (
                                <div className="text-center py-12">
                                  <Search className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                                  <p className="text-muted-foreground">Tidak ada siswa yang cocok dengan pencarian</p>
                                </div>
                              )}
                            </>
                          )}

                          {selectedSchedule && (!students || students.length === 0) && (
                            <div className="text-center py-12 bg-muted/30 rounded-lg">
                              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                              <p className="text-muted-foreground">Tidak ada siswa dalam kelas ini</p>
                            </div>
                          )}

                          {!selectedSchedule && (
                            <div className="text-center py-12 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border-2 border-dashed border-primary/30">
                              <TrendingUp className="h-16 w-16 mx-auto text-primary mb-3" />
                              <p className="text-lg font-semibold mb-2">Pilih Jadwal untuk Memulai</p>
                              <p className="text-sm text-muted-foreground">Pilih jadwal pelajaran dan tanggal untuk mulai mengisi absensi</p>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Footer Actions */}
                      <div className="flex items-center justify-between p-6 border-t bg-muted/30">
                        <div className="text-sm text-muted-foreground">
                          {selectedSchedule && students && (
                            <span className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4" />
                              {attendanceStatsDialog.hadir} dari {attendanceStatsDialog.total} siswa hadir
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3">
                          <Button variant="outline" onClick={() => {
                            setIsDialogOpen(false);
                            setAttendanceData({});
                            setSelectedSchedule('');
                            setSearchQuery('');
                          }}>
                            Batal
                          </Button>
                          <Button
                            onClick={handleSubmitAttendance}
                            disabled={!selectedSchedule || !students || students.length === 0 || createAttendanceMutation.isPending}
                            className="bg-gradient-primary min-w-32"
                          >
                            {createAttendanceMutation.isPending ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                Menyimpan...
                              </>
                            ) : (
                              <>
                                <ClipboardCheck className="mr-2 h-4 w-4" />
                                Simpan Absensi
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </>
            )}
          </div>
        </div>

        {/* Filter Section */}
        <Card className="card-hover border-none shadow-md">
          <CardHeader className="pb-2 md:pb-6">
            <CardTitle className="flex items-center gap-2 text-sm md:text-base">
              <Filter className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              Filter Data
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <div className="space-y-2 md:space-y-4">
              {/* Quick Filter Buttons - Compact on mobile */}
              <div className="flex flex-wrap gap-1.5 md:gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleThisWeek}
                  className="gap-1 h-8 text-[11px] px-2 md:h-9 md:text-sm md:px-3"
                >
                  <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5" />
                  Minggu Ini
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleThisMonth}
                  className="gap-1 h-8 text-[11px] px-2 md:h-9 md:text-sm md:px-3"
                >
                  <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5" />
                  Bulan Ini
                </Button>
                <Select value={selectedMonth} onValueChange={handleMonthSelect}>
                  <SelectTrigger className="w-[110px] md:w-[180px] h-8 md:h-9 text-[11px] md:text-sm">
                    <SelectValue placeholder="Pilih Bulan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025-01">Januari 2025</SelectItem>
                    <SelectItem value="2025-02">Februari 2025</SelectItem>
                    <SelectItem value="2025-03">Maret 2025</SelectItem>
                    <SelectItem value="2025-04">April 2025</SelectItem>
                    <SelectItem value="2025-05">Mei 2025</SelectItem>
                    <SelectItem value="2025-06">Juni 2025</SelectItem>
                    <SelectItem value="2025-07">Juli 2025</SelectItem>
                    <SelectItem value="2025-08">Agustus 2025</SelectItem>
                    <SelectItem value="2025-09">September 2025</SelectItem>
                    <SelectItem value="2025-10">Oktober 2025</SelectItem>
                    <SelectItem value="2025-11">November 2025</SelectItem>
                    <SelectItem value="2025-12">Desember 2025</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date and Filter Inputs - Single column on mobile, 4 columns on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-4">
                <div className="grid grid-cols-2 gap-2 md:contents">
                  <div className="space-y-1">
                    <Label className="text-[11px] md:text-sm">Tanggal Mulai</Label>
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => {
                        setFilterStartDate(e.target.value);
                        setSelectedMonth('');
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs md:text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] md:text-sm">Tanggal Akhir</Label>
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => {
                        setFilterEndDate(e.target.value);
                        setSelectedMonth('');
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs md:text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:contents">
                  <div className="space-y-1">
                    <Label className="text-[11px] md:text-sm">Kelas</Label>
                    <Select value={filterClass} onValueChange={setFilterClass}>
                      <SelectTrigger className="h-9 text-xs md:text-sm">
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
                  <div className="space-y-1">
                    <Label className="text-[11px] md:text-sm">Mata Pelajaran</Label>
                    <Select value={filterSubject} onValueChange={setFilterSubject}>
                      <SelectTrigger className="h-9 text-xs md:text-sm">
                        <SelectValue placeholder="Semua Mapel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Mapel</SelectItem>
                        {subjects?.map((subject) => (
                          <SelectItem key={subject} value={subject}>
                            {subject}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 gap-3 md:gap-6 md:grid-cols-4">
          <Card className="card-hover border-none shadow-md">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Hadir</p>
                  <p className="text-xl md:text-3xl font-bold text-green-600">{stats.hadir}</p>
                </div>
                <div className="badge-hadir w-8 h-8 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-sm md:text-lg font-bold">
                  H
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover border-none shadow-md">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Izin</p>
                  <p className="text-xl md:text-3xl font-bold text-blue-600">{stats.izin}</p>
                </div>
                <div className="badge-izin w-8 h-8 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-sm md:text-lg font-bold">
                  I
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover border-none shadow-md">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Sakit</p>
                  <p className="text-xl md:text-3xl font-bold text-yellow-600">{stats.sakit}</p>
                </div>
                <div className="badge-sakit w-8 h-8 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-sm md:text-lg font-bold">
                  S
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover border-none shadow-md">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Alpa</p>
                  <p className="text-xl md:text-3xl font-bold text-red-600">{stats.alpa}</p>
                </div>
                <div className="badge-alpa w-8 h-8 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-sm md:text-lg font-bold">
                  A
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2">
          <Card className="card-hover border-none shadow-md">
            <CardHeader className="pb-2 md:pb-6">
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                Grafik Kehadiran
              </CardTitle>
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

          <Card className="card-hover border-none shadow-md">
            <CardHeader className="pb-2 md:pb-6">
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                Distribusi Kehadiran
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-6">
              <ResponsiveContainer width="100%" height={200} className="md:!h-[300px]">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
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
        </div>

        {/* Absent Students List */}
        <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3">
          <Card className="card-hover border-none shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserX className="h-5 w-5 text-blue-600" />
                Siswa Izin ({absentByReason.izin.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {absentByReason.izin.length > 0 ? (
                  absentByReason.izin.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{toTitleCase(record.students?.full_name || '')}</p>
                        <p className="text-xs text-muted-foreground">{record.students?.classes?.name}</p>
                      </div>
                      <span className="badge-izin px-2 py-1 text-xs font-bold rounded">I</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Tidak ada siswa izin</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover border-none shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserX className="h-5 w-5 text-yellow-600" />
                Siswa Sakit ({absentByReason.sakit.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {absentByReason.sakit.length > 0 ? (
                  absentByReason.sakit.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{toTitleCase(record.students?.full_name || '')}</p>
                        <p className="text-xs text-muted-foreground">{record.students?.classes?.name}</p>
                      </div>
                      <span className="badge-sakit px-2 py-1 text-xs font-bold rounded">S</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Tidak ada siswa sakit</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover border-none shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserX className="h-5 w-5 text-red-600" />
                Siswa Alpa ({absentByReason.alpa.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {absentByReason.alpa.length > 0 ? (
                  absentByReason.alpa.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{toTitleCase(record.students?.full_name || '')}</p>
                        <p className="text-xs text-muted-foreground">{record.students?.classes?.name}</p>
                      </div>
                      <span className="badge-alpa px-2 py-1 text-xs font-bold rounded">A</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Tidak ada siswa alpa</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Attendance Table */}
        <Card className="card-hover border-none shadow-md">
          <CardHeader className="pb-2 md:pb-6">
            <CardTitle className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-sm md:text-base">
                <ClipboardCheck className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                Rekap Detail Absensi
              </div>
              <p className="text-xs md:text-sm text-muted-foreground font-normal">
                Menampilkan {paginatedRecords.length} dari {sortedRecords.length} data
              </p>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-6">
            <div className="space-y-4 overflow-x-auto">
                <Table className="min-w-[700px] md:min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('date')}
                        className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                      >
                        Tanggal
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>NIS</TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                      >
                        Nama
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('class')}
                        className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                      >
                        Kelas
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>Mata Pelajaran</TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                      >
                        Status
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRecords && paginatedRecords.length > 0 ? (
                    paginatedRecords.map((record) => {
                      const isFirstRecord = record.notes?.includes('[Absensi Pertama]');
                      const isDefault = record.notes?.includes('[Default Wali Kelas');
                      const isOverride = record.notes?.includes('[Override dari');
                      
                      let cleanNotes = record.notes || '-';
                      if (cleanNotes !== '-') {
                        cleanNotes = cleanNotes
                          .replace(/\[Absensi Pertama\]/g, '')
                          .replace(/\[Default Wali Kelas[^\]]*\]/g, '')
                          .replace(/\[Override dari[^\]]*\]/g, '')
                          .trim() || '-';
                      }
                      
                      return (
                        <TableRow key={`${record.student_id}-${record.students?.class_id}-${record.date}`}>
                          <TableCell>{new Date(record.date).toLocaleDateString('id-ID')}</TableCell>
                          <TableCell>{record.students?.nis}</TableCell>
                          <TableCell className="font-medium">{toTitleCase(record.students?.full_name || '')}</TableCell>
                          <TableCell>{record.students?.classes?.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{record.schedules?.subject || '-'}</TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                record.status === 'hadir'
                                  ? 'badge-hadir'
                                  : record.status === 'sakit'
                                  ? 'badge-sakit'
                                  : record.status === 'izin'
                                  ? 'badge-izin'
                                  : 'badge-alpa'
                              }`}
                            >
                              {record.status === 'hadir' ? 'Hadir' : record.status === 'sakit' ? 'Sakit' : record.status === 'izin' ? 'Izin' : 'Alpa'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isOverride ? (
                              <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">
                                Override
                              </Badge>
                            ) : isDefault ? (
                              <Badge variant="secondary">
                                Default WK
                              </Badge>
                            ) : isFirstRecord ? (
                              <Badge variant="outline" className="border-green-500 text-green-700">
                                Pertama
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                Manual
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{cleanNotes}</TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Tidak ada data absensi
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pt-4">
                  <p className="text-xs md:text-sm text-muted-foreground text-center md:text-left">
                    Halaman {currentPage} dari {totalPages}
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">Sebelumnya</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="gap-1"
                    >
                      <span className="hidden sm:inline">Selanjutnya</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Attendance;
