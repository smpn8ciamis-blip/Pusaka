import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, ClipboardCheck, Filter, Printer, Download, BarChart3, Users, UserX, FileText,
  Search, CheckCircle2, XCircle, Clock, Stethoscope, User, TrendingUp, Calendar,
  ArrowUpDown, ChevronLeft, ChevronRight, Info, X,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { DuplicateAttendanceManager } from '@/components/DuplicateAttendanceManager';
import {
  useAttendanceDaySettings,
  isAttendanceAllowedForDate,
  getActiveDayNames,
} from '@/hooks/useAttendanceDaySettings';
import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF, addSignatureToPDF } from '@/lib/pdfLetterhead';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
  generateSecureToken,
  sha256Hex,
  buildVerificationUrl,
  addVerificationQR,
} from '@/lib/reportVerification';

const COLORS = {
  Hadir: '#10b981',
  Sakit: '#f59e0b',
  Izin: '#3b82f6',
  Alpa: '#ef4444',
  Terlambat: '#f97316',
};

/** Palet warna status PDF — subtle & elegan */
const STATUS_PALETTE: Record<
  string,
  { bg: [number, number, number]; fg: [number, number, number] }
> = {
  Izin:  { bg: [239, 246, 255], fg: [ 30,  64, 175] },
  Sakit: { bg: [255, 251, 235], fg: [146,  64,  14] },
  Alpa:  { bg: [255, 241, 242], fg: [159,  18,  57] },
};

type StatusKey = 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpa';
interface ClassRow {
  kelas: string;
  Hadir: number;
  Terlambat: number;
  Izin: number;
  Sakit: number;
  Alpa: number;
}

const STATUS_RGB: Record<StatusKey, [number, number, number]> = {
  Hadir: [16, 185, 129],
  Terlambat: [249, 115, 22],
  Izin: [59, 130, 246],
  Sakit: [245, 158, 11],
  Alpa: [239, 68, 68],
};

/** Tanggal lokal → 'yyyy-MM-dd' (aman untuk zona WIB, tidak mundur sehari seperti toISOString) */
const toISODate = (d: Date) => format(d, 'yyyy-MM-dd');

/** '2026-10-06' → '06 Okt 2026' */
const formatTanggalID = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

/** '8A_2026/2027' → '8A' (ambil bagian sebelum tanda '_') */
const shortClass = (name?: string | null): string => {
  if (!name) return '-';
  return name.split('_')[0].trim() || name;
};

/* ============================================================
   HELPER: Load gambar dari URL → PNG base64
   ============================================================ */
const loadImageAsBase64 = (url: string): Promise<string | null> => {
  if (!url) return Promise.resolve(null);
  if (url.startsWith('data:image/')) return Promise.resolve(url);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

/**
 * Kop surat rapat + logo kiri-kanan.
 * Return: posisi Y setelah kop.
 */
const drawCompactLetterhead = async (doc: any, settings: any): Promise<number> => {
  const pageWidth = doc.internal.pageSize.getWidth();

  const districtRaw = settings?.district_name || settings?.header_line1 || '';
  const headerText = districtRaw
    ? (/^\s*pemerintah\b/i.test(districtRaw)
        ? districtRaw
        : `PEMERINTAH ${districtRaw}`
      ).toUpperCase()
    : '';

  const cfg = {
    headerText,
    schoolName: (settings?.school_name || '').toUpperCase(),
    address: settings?.school_address || '',
    phone: settings?.school_phone ? `Telp: ${settings.school_phone}` : '',
    padTop: 10,
    lineGap: 7,
    gapAddress: 6,
    gapPhone: 4,
    gapLine: 7.5,
    lineGapAfter: 5,
    fsHeader: 12,
    fsSchool: 16,
    fsAddress: 9,
    fsPhone: 9,
    logoSize: 22,
    logoX: 16,
    logoY: 9,
  };

  const [logoLeft, logoRight] = await Promise.all([
    loadImageAsBase64(settings?.logo_url || ''),
    loadImageAsBase64(settings?.right_logo_url || ''),
  ]);

  if (logoLeft) {
    try {
      doc.addImage(logoLeft, 'PNG', cfg.logoX, cfg.logoY, cfg.logoSize, cfg.logoSize, undefined, 'FAST');
    } catch (e) {
      console.warn('Gagal render logo kiri:', e);
    }
  }

  if (logoRight) {
    try {
      doc.addImage(
        logoRight, 'PNG',
        pageWidth - cfg.logoX - cfg.logoSize, cfg.logoY,
        cfg.logoSize, cfg.logoSize,
        undefined, 'FAST',
      );
    } catch (e) {
      console.warn('Gagal render logo kanan:', e);
    }
  }

  const centerX = pageWidth / 2;
  let y = cfg.padTop + 4;

  if (cfg.headerText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(cfg.fsHeader);
    doc.setTextColor(0, 0, 0);
    doc.text(cfg.headerText, centerX, y, { align: 'center' });
    y += cfg.lineGap;
  }

  if (cfg.schoolName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cfg.fsSchool);
    doc.text(cfg.schoolName, centerX, y, { align: 'center' });
    y += cfg.gapAddress;
  }

  if (cfg.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(cfg.fsAddress);
    doc.text(cfg.address, centerX, y, { align: 'center' });
    y += cfg.gapPhone;
  }

  if (cfg.phone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(cfg.fsPhone);
    doc.text(cfg.phone, centerX, y, { align: 'center' });
    y += cfg.gapLine;
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.line(14, y, pageWidth - 14, y);
  doc.setLineWidth(0.2);
  doc.line(14, y + 0.8, pageWidth - 14, y + 0.8);

  return y + cfg.lineGapAfter;
};

/**
 * Grafik batang bertumpuk per kelas, digambar langsung di jsPDF.
 * Return: posisi Y berikutnya.
 */
const drawClassChart = (doc: any, data: ClassRow[], startY: number): number => {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 14;
  const right = pageW - 14;
  const labelW = 28;
  const pctW = 14;
  const barX = left + labelW;
  const barW = right - barX - pctW - 2;
  const barH = 5.5;
  const rowGap = 3.5;
  const keys = Object.keys(STATUS_RGB) as StatusKey[];
  let y = startY;

  const ensure = (h: number) => {
    if (y + h > pageH - 18) { doc.addPage(); y = 20; }
  };

  ensure(24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('GRAFIK KEHADIRAN PER KELAS', left, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text('Persentase di kanan = kehadiran (Hadir + Terlambat) dari seluruh data absensi pada periode ini.', left, y);
  y += 6;

  // legenda
  let lx = left;
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  keys.forEach((k) => {
    doc.setFillColor(...STATUS_RGB[k]);
    doc.rect(lx, y - 3, 3, 3, 'F');
    doc.text(k, lx + 5, y - 0.4);
    lx += doc.getTextWidth(k) + 13;
  });
  y += 6;

  data.forEach((row) => {
    ensure(barH + rowGap);
    const total = keys.reduce((s, k) => s + row[k], 0);
    const hadirPct = total ? Math.round(((row.Hadir + row.Terlambat) / total) * 100) : 0;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(row.kelas, left, y + barH - 1.4, { maxWidth: labelW - 2 });

    doc.setFillColor(243, 244, 246);
    doc.rect(barX, y, barW, barH, 'F');

    let x = barX;
    keys.forEach((k) => {
      const v = row[k];
      if (!v || !total) return;
      const w = (v / total) * barW;
      doc.setFillColor(...STATUS_RGB[k]);
      doc.rect(x, y, w, barH, 'F');
      if (w > 6) {
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        doc.text(String(v), x + w / 2, y + barH - 1.7, { align: 'center' });
      }
      x += w;
    });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`${hadirPct}%`, right, y + barH - 1.4, { align: 'right' });

    y += barH + rowGap;
  });

  doc.setTextColor(0, 0, 0);
  return y + 4;
};

const Attendance = () => {
  const { userRole, user } = useAuth();
  const { selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const isFullAccessRole =
    userRole === 'admin' || userRole === 'kesiswaan' || userRole === 'guru_piket';

  const toTitleCase = (name: string): string =>
    name
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));
  const [filterStartDate, setFilterStartDate] = useState(toISODate(new Date()));
  const [filterEndDate, setFilterEndDate] = useState(toISODate(new Date()));
  const [filterClass, setFilterClass] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [attendanceData, setAttendanceData] = useState<
    Record<string, { status: string; notes: string }>
  >({});
  const [sortField, setSortField] = useState<'date' | 'name' | 'class' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const itemsPerPage = 50;

  const { data: attendanceDaySettings } = useAttendanceDaySettings();
  const isDayAllowed = isAttendanceAllowedForDate(selectedDate, attendanceDaySettings);
  const activeDayNames = getActiveDayNames(attendanceDaySettings);

  React.useEffect(() => {
    if (userRole !== 'teacher' || !user?.id) return;
    const channel = supabase.channel('attendance-notifications');
    channel
      .on('broadcast', { event: 'homeroom-attendance-filled' }, (payload: any) => {
        const { className, date } = payload.payload;
        toast.info(`📢 Absensi kelas ${className} untuk ${date} telah diisi. Data default tersedia!`, {
          duration: 8000,
        });
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
      if (userRole === 'teacher' && user?.id) {
        const { data: teacher } = await supabase
          .from('teachers').select('id').eq('user_id', user.id).maybeSingle();
        if (!teacher) return [];
        const { data: schedules, error: schedError } = await supabase
          .from('schedules').select('class_id').eq('teacher_id', teacher.id).eq('academic_year', selectedYear);
        if (schedError) throw schedError;
        const classIds = Array.from(new Set(schedules?.map((s) => s.class_id) || []));
        if (classIds.length === 0) return [];
        const { data, error } = await supabase.from('classes').select('*').in('id', classIds).order('name');
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('classes').select('*').eq('academic_year', selectedYear).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedYear && (isFullAccessRole || !!user?.id),
  });

  const { data: subjects } = useQuery({
    queryKey: ['subjects', selectedYear, userRole, user?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      if (userRole === 'teacher' && user?.id) {
        const { data: teacher } = await supabase
          .from('teachers').select('id').eq('user_id', user.id).maybeSingle();
        if (!teacher) return [];
        const { data, error } = await supabase
          .from('schedules').select('subject')
          .eq('teacher_id', teacher.id).eq('academic_year', selectedYear).order('subject');
        if (error) throw error;
        return Array.from(new Set(data.map((s) => s.subject)));
      }
      const { data, error } = await supabase
        .from('schedules').select('subject').eq('academic_year', selectedYear).order('subject');
      if (error) throw error;
      return Array.from(new Set(data.map((s) => s.subject)));
    },
    enabled: !!selectedYear && (isFullAccessRole || !!user?.id),
  });

  const { data: schedules } = useQuery({
    queryKey: ['teacher-schedules', user?.id, userRole],
    queryFn: async () => {
      if (isFullAccessRole) {
        const { data, error } = await supabase
          .from('schedules').select(`*, classes(id, name), teachers!inner(id, user_id)`).order('day_of_week');
        if (error) throw error;
        return data;
      }
      const { data: teacher, error: teacherError } = await supabase
        .from('teachers').select('id').eq('user_id', user?.id).maybeSingle();
      if (teacherError) throw teacherError;
      if (!teacher) return [];
      const { data, error } = await supabase
        .from('schedules')
        .select(`*, classes(id, name), teachers!inner(id, user_id)`)
        .eq('teacher_id', teacher.id).eq('academic_year', selectedYear).order('day_of_week');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!userRole,
  });

  const { data: students } = useQuery({
    queryKey: ['schedule-students', selectedSchedule],
    queryFn: async () => {
      if (!selectedSchedule) return [];
      const { data: schedule } = await supabase
        .from('schedules').select('class_id').eq('id', selectedSchedule).maybeSingle();
      if (!schedule) return [];
      const { data, error } = await supabase
        .from('students').select('*').eq('class_id', schedule.class_id)
        .eq('status', 'aktif').eq('is_alumni', false).order('full_name');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSchedule,
  });

  const { data: existingAttendance } = useQuery({
    queryKey: ['existing-attendance', selectedSchedule, selectedDate],
    queryFn: async () => {
      if (!selectedSchedule || !selectedDate) return [];
      const { data: schedule } = await supabase
        .from('schedules').select('class_id').eq('id', selectedSchedule).maybeSingle();
      if (!schedule) return [];
      const { data: classStudents } = await supabase
        .from('students').select('id').eq('class_id', schedule.class_id)
        .eq('status', 'aktif').eq('is_alumni', false);
      if (!classStudents) return [];
      const studentIds = classStudents.map((s) => s.id);
      const { data, error } = await supabase
        .from('attendance')
        .select(`*, students!inner(id, full_name, class_id, status), schedules(id, subject, start_time)`)
        .in('student_id', studentIds).eq('date', selectedDate).eq('students.status', 'aktif')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const firstRecords = new Map();
      data?.forEach((record) => {
        if (!firstRecords.has(record.student_id)) firstRecords.set(record.student_id, record);
      });
      return Array.from(firstRecords.values());
    },
    enabled: !!selectedSchedule && !!selectedDate,
  });

  React.useEffect(() => {
    if (existingAttendance && existingAttendance.length > 0) {
      const prePopulatedData: Record<string, { status: string; notes: string }> = {};
      existingAttendance.forEach((record: any) => {
        const statusMap: Record<string, string> = {
          hadir: 'Hadir', terlambat: 'Terlambat', sakit: 'Sakit', izin: 'Izin', alpa: 'Alpa',
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
      let scheduleIds: string[] = [];
      if (userRole === 'teacher') {
        const { data: teacher } = await supabase
          .from('teachers').select('id').eq('user_id', user?.id).maybeSingle();
        if (!teacher) return [];
        const { data: teacherSchedules } = await supabase
          .from('schedules').select('id').eq('teacher_id', teacher.id);
        scheduleIds = teacherSchedules?.map((s) => s.id) || [];
        if (scheduleIds.length === 0) return [];
      }

      let studentIds: string[] | undefined;
      if (filterClass !== 'all') {
        const { data: classStudents } = await supabase
          .from('students').select('id').eq('class_id', filterClass)
          .eq('status', 'aktif').eq('is_alumni', false);
        studentIds = classStudents?.map((s) => s.id) || [];
        if (studentIds.length === 0) return [];
      }

      let query = supabase
        .from('attendance')
        .select(`*, students!inner(id, full_name, nis, class_id, status, classes(name)), schedules(subject)`)
        .gte('date', filterStartDate).lte('date', filterEndDate).eq('students.status', 'aktif');

      if (userRole === 'teacher' && scheduleIds.length > 0) query = query.in('schedule_id', scheduleIds);
      if (studentIds) query = query.in('student_id', studentIds);
      const { data, error } = await query.order('date', { ascending: false });
      if (error) throw error;

      if (filterSubject !== 'all' && data) return data.filter((r) => r.schedules?.subject === filterSubject);
      return data;
    },
    enabled: !!userRole && (isFullAccessRole || !!user?.id),
  });

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    if (!searchQuery) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(
      (s) => toTitleCase(s.full_name).toLowerCase().includes(q) || s.nis.toLowerCase().includes(q),
    );
  }, [students, searchQuery]);

  const attendanceStatsDialog = useMemo(() => {
    if (!students) return { hadir: 0, terlambat: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
    const stats = { hadir: 0, terlambat: 0, sakit: 0, izin: 0, alpa: 0, total: students.length };
    students.forEach((student) => {
      const status = attendanceData[student.id]?.status || 'Hadir';
      if (status === 'Hadir') stats.hadir++;
      else if (status === 'Terlambat') stats.terlambat++;
      else if (status === 'Sakit') stats.sakit++;
      else if (status === 'Izin') stats.izin++;
      else if (status === 'Alpa') stats.alpa++;
    });
    return stats;
  }, [students, attendanceData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Hadir': return 'bg-green-500 hover:bg-green-600';
      case 'Terlambat': return 'bg-orange-500 hover:bg-orange-600';
      case 'Sakit': return 'bg-amber-500 hover:bg-amber-600';
      case 'Izin': return 'bg-blue-500 hover:bg-blue-600';
      case 'Alpa': return 'bg-red-500 hover:bg-red-600';
      default: return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Hadir': return <CheckCircle2 className="w-5 h-5" />;
      case 'Terlambat': return <Clock className="w-5 h-5" />;
      case 'Sakit': return <Stethoscope className="w-5 h-5" />;
      case 'Izin': return <Clock className="w-5 h-5" />;
      case 'Alpa': return <XCircle className="w-5 h-5" />;
      default: return <User className="w-5 h-5" />;
    }
  };

  const quickMarkAll = (status: string) => {
    if (!students) return;
    const newData: Record<string, { status: string; notes: string }> = {};
    students.forEach((s) => { newData[s.id] = { status, notes: '' }; });
    setAttendanceData(newData);
    toast.success(`Semua siswa ditandai ${status}`);
  };

  const deduplicatedRecords = React.useMemo(() => {
    if (!attendanceRecords) return [];
    const recordMap = new Map<string, any>();
    const sortedRecords = [...attendanceRecords].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    );
    sortedRecords.forEach((record) => {
      const classId = record.students?.class_id || 'unknown';
      const key = `${record.student_id}-${classId}-${record.date}`;
      if (!recordMap.has(key)) recordMap.set(key, record);
    });
    return Array.from(recordMap.values());
  }, [attendanceRecords]);

  const sortedRecords = React.useMemo(() => {
    const sorted = [...deduplicatedRecords].sort((a, b) => {
      let compareValue = 0;
      switch (sortField) {
        case 'date': compareValue = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
        case 'name': compareValue = toTitleCase(a.students?.full_name || '').localeCompare(toTitleCase(b.students?.full_name || '')); break;
        case 'class': compareValue = (a.students?.classes?.name || '').localeCompare(b.students?.classes?.name || ''); break;
        case 'status': compareValue = (a.status || '').localeCompare(b.status || ''); break;
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
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('asc'); }
    setCurrentPage(1);
  };

  const handleThisWeek = () => {
    const today = new Date();
    setFilterStartDate(toISODate(startOfWeek(today, { weekStartsOn: 1 })));
    setFilterEndDate(toISODate(endOfWeek(today, { weekStartsOn: 1 })));
    setSelectedMonth('');
    setCurrentPage(1);
  };

  const handleThisMonth = () => {
    const today = new Date();
    setFilterStartDate(toISODate(startOfMonth(today)));
    setFilterEndDate(toISODate(endOfMonth(today)));
    setSelectedMonth('');
    setCurrentPage(1);
  };

  const handleMonthSelect = (month: string) => {
    if (!month) { setSelectedMonth(''); return; }
    const [year, monthNum] = month.split('-');
    const start = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    setFilterStartDate(toISODate(startOfMonth(start)));
    setFilterEndDate(toISODate(endOfMonth(start)));
    setSelectedMonth(month);
    setCurrentPage(1);
  };

  const stats = React.useMemo(() => ({
    hadir: deduplicatedRecords.filter((r) => r.status === 'hadir' || r.status === 'terlambat').length,
    terlambat: deduplicatedRecords.filter((r) => r.status === 'terlambat').length,
    izin: deduplicatedRecords.filter((r) => r.status === 'izin').length,
    sakit: deduplicatedRecords.filter((r) => r.status === 'sakit').length,
    alpa: deduplicatedRecords.filter((r) => r.status === 'alpa').length,
  }), [deduplicatedRecords]);

  const absentByReason = React.useMemo(() => ({
    izin: deduplicatedRecords.filter((r) => r.status === 'izin'),
    sakit: deduplicatedRecords.filter((r) => r.status === 'sakit'),
    alpa: deduplicatedRecords.filter((r) => r.status === 'alpa'),
  }), [deduplicatedRecords]);

  /** Data kehadiran per kelas (dipakai grafik di halaman & di PDF) */
  const classChartData = React.useMemo<ClassRow[]>(() => {
    const map = new Map<string, ClassRow>();
    deduplicatedRecords.forEach((r) => {
      const kelas = r.students?.classes?.name ? shortClass(r.students.classes.name) : 'Tanpa Kelas';
      if (!map.has(kelas)) {
        map.set(kelas, { kelas, Hadir: 0, Terlambat: 0, Izin: 0, Sakit: 0, Alpa: 0 });
      }
      const row = map.get(kelas)!;
      if (r.status === 'hadir') row.Hadir++;
      else if (r.status === 'terlambat') row.Terlambat++;
      else if (r.status === 'izin') row.Izin++;
      else if (r.status === 'sakit') row.Sakit++;
      else if (r.status === 'alpa') row.Alpa++;
    });
    return Array.from(map.values()).sort((a, b) =>
      a.kelas.localeCompare(b.kelas, 'id', { numeric: true }),
    );
  }, [deduplicatedRecords]);

  const chartData = [
    { name: 'Hadir', value: stats.hadir - stats.terlambat, color: COLORS.Hadir },
    { name: 'Terlambat', value: stats.terlambat, color: COLORS.Terlambat },
    { name: 'Izin', value: stats.izin, color: COLORS.Izin },
    { name: 'Sakit', value: stats.sakit, color: COLORS.Sakit },
    { name: 'Alpa', value: stats.alpa, color: COLORS.Alpa },
  ];

  const barChartData = [
    { status: 'Hadir', jumlah: stats.hadir - stats.terlambat },
    { status: 'Terlambat', jumlah: stats.terlambat },
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
          ignoreDuplicates: false,
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
    if (!selectedSchedule || !user) { toast.error('Silakan pilih jadwal terlebih dahulu'); return; }
    if (!students || students.length === 0) { toast.error('Tidak ada siswa dalam kelas ini'); return; }
    const attendanceList = students.map((student) => {
      const status = attendanceData[student.id]?.status || 'Hadir';
      const notes = attendanceData[student.id]?.notes || '';
      const statusMap: Record<string, string> = {
        Hadir: 'hadir', Terlambat: 'terlambat', Sakit: 'sakit', Izin: 'izin', Alpa: 'alpa',
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
    createAttendanceMutation.mutate(attendanceList);
  };

  const updateAttendanceStatus = (studentId: string, status: string) => {
    setAttendanceData((prev) => ({ ...prev, [studentId]: { ...prev[studentId], status } }));
  };
  const updateAttendanceNotes = (studentId: string, notes: string) => {
    setAttendanceData((prev) => ({ ...prev, [studentId]: { ...prev[studentId], notes } }));
  };

  const handlePrint = () => window.print();

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  /* ============================================================
     EXPORT PDF — Laporan Kehadiran
     ============================================================ */
  const handleExportPDF = async () => {
    if (!deduplicatedRecords) return;
    const doc = new jsPDF();
    const startY = await addLetterheadToPDF(doc, schoolSettings);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN KEHADIRAN SISWA', 105, startY, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: ${filterStartDate} s/d ${filterEndDate}`, 14, startY + 8);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, startY + 14);
    doc.text(`Hadir: ${stats.hadir} (termasuk terlambat: ${stats.terlambat})`, 14, startY + 22);
    doc.text(`Sakit: ${stats.sakit}`, 60, startY + 22);
    doc.text(`Izin: ${stats.izin}`, 90, startY + 22);
    doc.text(`Alpa: ${stats.alpa}`, 120, startY + 22);

    const cleanNotes = (notes: string | null) => {
      if (!notes) return '-';
      return notes
        .replace(/\[Absensi Pertama\]/gi, '')
        .replace(/\[Default Wali Kelas.*?\]/gi, '')
        .replace(/\[Override dari.*?\]/gi, '')
        .trim() || '-';
    };

    const tableData = deduplicatedRecords.map((r, index) => [
      index + 1, r.date, r.students?.nis || '-', toTitleCase(r.students?.full_name || '-'),
      shortClass(r.students?.classes?.name),
      r.status === 'hadir' ? 'Hadir'
        : r.status === 'terlambat' ? 'Terlambat'
        : r.status === 'sakit' ? 'Sakit'
        : r.status === 'izin' ? 'Izin' : 'Alpa',
      cleanNotes(r.notes),
    ]);

    autoTable(doc, {
      startY: startY + 30,
      head: [['No', 'Tanggal', 'NIS', 'Nama', 'Kelas', 'Status', 'Catatan']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] },
      styles: { fontSize: 8 },
    });

    const finalY = (doc as any).lastAutoTable.finalY;
    const reportData = {
      verification: 'DOKUMEN VALID',
      type: 'Laporan Kehadiran Siswa',
      school: schoolSettings?.school_name,
      period: `${filterStartDate} s/d ${filterEndDate}`,
      stats: { hadir: stats.hadir, terlambat: stats.terlambat, sakit: stats.sakit, izin: stats.izin, alpa: stats.alpa },
      students: deduplicatedRecords.map((r) => ({
        nis: r.students?.nis, nama: toTitleCase(r.students?.full_name || ''),
        kelas: shortClass(r.students?.classes?.name), status: r.status, tanggal: r.date, catatan: cleanNotes(r.notes),
      })),
      printDate: new Date().toISOString(),
      totalRecords: deduplicatedRecords.length,
    };

    const { data: serialData, error: serialError } = await supabase.rpc('generate_report_serial');
    if (serialError) { toast.error('Gagal menggenerate nomor seri laporan'); return; }
    const { error: insertError } = await supabase.from('verified_reports').insert({
      serial_number: serialData, report_type: 'attendance', report_data: reportData, created_by: user?.id,
    });
    if (insertError) { toast.error('Gagal menyimpan data laporan untuk verifikasi'); return; }

    await addSignatureToPDF(
      doc, schoolSettings, schoolSettings?.headmaster_name,
      schoolSettings?.headmaster_nip, finalY, serialData,
    );
    doc.save(`kehadiran-${filterStartDate}-${filterEndDate}.pdf`);
    toast.success('Laporan berhasil dicetak dengan QR code verifikasi');
  };

  /* ============================================================
     EXPORT REKAP — per mata pelajaran
     (fix: filterSubject berisi NAMA mapel, bukan schedule.id;
      fix: tanggal tidak lagi memakai toISOString → aman WIB)
     ============================================================ */
  const handleExportRekapPDF = async () => {
    if (!deduplicatedRecords) return;
    const studentMap = new Map();
    deduplicatedRecords.forEach((record) => {
      if (record.students && !studentMap.has(record.student_id)) {
        studentMap.set(record.student_id, record.students);
      }
    });
    const studentsList = Array.from(studentMap.values());
    if (studentsList.length === 0) { toast.error('Tidak ada data siswa untuk diekspor'); return; }

    const doc = new jsPDF('l', 'mm', 'a4');
    const startY = await addLetterheadToPDF(doc, schoolSettings);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP KEHADIRAN SISWA PER MATA PELAJARAN', doc.internal.pageSize.getWidth() / 2, startY, { align: 'center' });

    const classInfo =
      filterClass !== 'all'
        ? shortClass(classes?.find((c: any) => c.id === filterClass)?.name)
        : 'Semua Kelas';
    const subjectInfo = filterSubject !== 'all' ? filterSubject : 'Semua Mata Pelajaran';

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Kelas: ${classInfo}`, 14, startY + 8);
    doc.text(`Mata Pelajaran: ${subjectInfo}`, 14, startY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: ${filterStartDate} s/d ${filterEndDate}`, 14, startY + 20);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, startY + 26);

    // Daftar tanggal (lokal, tanpa geser zona waktu)
    const [sy, sm, sd] = filterStartDate.split('-').map(Number);
    const [ey, em, ed] = filterEndDate.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    const dates: string[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(toISODate(d));
    }
    const dayNumbers = dates.map((date) => parseInt(date.slice(8, 10), 10));
    const headers = ['No', 'NISN', 'Nama Siswa', ...dayNumbers.map((d) => d.toString()), 'H', 'T', 'S', 'I', 'A'];

    const attendanceMap = new Map<string, Map<string, string>>();
    deduplicatedRecords.forEach((record) => {
      if (!attendanceMap.has(record.student_id)) attendanceMap.set(record.student_id, new Map());
      const statusCode = record.status === 'hadir' ? 'H'
        : record.status === 'terlambat' ? 'T'
        : record.status === 'sakit' ? 'S'
        : record.status === 'izin' ? 'I' : 'A';
      attendanceMap.get(record.student_id)?.set(record.date, statusCode);
    });

    const studentStats = studentsList.map((student: any) => {
      const studentRecords = deduplicatedRecords.filter((r) => r.student_id === student.id);
      return {
        id: student.id, nisn: student.nisn || student.nis, nis: student.nis,
        full_name: student.full_name,
        hadir: studentRecords.filter((r) => r.status === 'hadir').length,
        terlambat: studentRecords.filter((r) => r.status === 'terlambat').length,
        sakit: studentRecords.filter((r) => r.status === 'sakit').length,
        izin: studentRecords.filter((r) => r.status === 'izin').length,
        alpa: studentRecords.filter((r) => r.status === 'alpa').length,
      };
    });

    const tableData = studentStats.map((student, index) => {
      const studentAttendance = attendanceMap.get(student.id) || new Map();
      const row: any[] = [index + 1, student.nisn, toTitleCase(student.full_name)];
      dates.forEach((date) => { row.push(studentAttendance.get(date) || '-'); });
      row.push(
        student.hadir.toString(), student.terlambat.toString(),
        student.sakit.toString(), student.izin.toString(), student.alpa.toString(),
      );
      return row;
    });

    autoTable(doc, {
      startY: startY + 34,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246], fontSize: 7, halign: 'center' },
      styles: { fontSize: 6, cellPadding: 1, halign: 'center' },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 15 }, 2: { cellWidth: 30, halign: 'left' } },
      margin: { left: 10, right: 10 },
      didParseCell: (data) => {
        const cellValue = data.cell.raw;
        if (cellValue === 'H') { data.cell.styles.fillColor = [16, 185, 129]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = 'bold'; }
        else if (cellValue === 'T') { data.cell.styles.fillColor = [249, 115, 22]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = 'bold'; }
        else if (cellValue === 'S') { data.cell.styles.fillColor = [245, 158, 11]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = 'bold'; }
        else if (cellValue === 'I') { data.cell.styles.fillColor = [59, 130, 246]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = 'bold'; }
        else if (cellValue === 'A') { data.cell.styles.fillColor = [239, 68, 68]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = 'bold'; }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY || startY + 34;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Keterangan:', 14, finalY + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setFillColor(16, 185, 129); doc.rect(14, finalY + 13, 5, 5, 'F'); doc.text('H = Hadir', 21, finalY + 17);
    doc.setFillColor(249, 115, 22); doc.rect(50, finalY + 13, 5, 5, 'F'); doc.text('T = Terlambat', 57, finalY + 17);
    doc.setFillColor(245, 158, 11); doc.rect(95, finalY + 13, 5, 5, 'F'); doc.text('S = Sakit', 102, finalY + 17);
    doc.setFillColor(59, 130, 246); doc.rect(130, finalY + 13, 5, 5, 'F'); doc.text('I = Izin', 137, finalY + 17);
    doc.setFillColor(239, 68, 68); doc.rect(165, finalY + 13, 5, 5, 'F'); doc.text('A = Alpa', 172, finalY + 17);
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
    // Escape CSV agar koma/kutip/newline di catatan tidak merusak kolom
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const csvContent = [
      ['Tanggal', 'NIS', 'Nama', 'Kelas', 'Status', 'Catatan'].map(esc).join(','),
      ...deduplicatedRecords.map((r) =>
        [
          r.date, r.students?.nis || '', toTitleCase(r.students?.full_name || ''),
          shortClass(r.students?.classes?.name), r.status, cleanNotesForExport(r.notes),
        ].map(esc).join(','),
      ),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `absensi-${filterStartDate}-${filterEndDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  /* ============================================================
     ⭐ PRINT ABSENT — laporan siswa tidak hadir (dirapikan)
     - Kop + judul + info periode/kelas/mapel
     - 4 kartu ringkasan
     - Grafik kehadiran per kelas
     - Tabel garis tipis + tanggal format Indonesia
     - QR verifikasi + nomor halaman
     ============================================================ */
  const handlePrintAbsent = async () => {
    if (!absentByReason) return;

    const totalAbsent =
      absentByReason.izin.length + absentByReason.sakit.length + absentByReason.alpa.length;
    if (totalAbsent === 0) {
      toast.info('Tidak ada siswa tidak hadir pada periode ini');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // ==== KOP ====
    const startY = await drawCompactLetterhead(doc, schoolSettings);

    // ==== JUDUL ====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('REKAP SISWA TIDAK HADIR', pageWidth / 2, startY + 3, { align: 'center' });

    const classLabel =
      filterClass === 'all'
        ? 'Semua Kelas'
        : shortClass(classes?.find((c: any) => c.id === filterClass)?.name);
    const subjectLabel = filterSubject === 'all' ? 'Semua Mapel' : filterSubject;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(
      `Periode ${formatTanggalID(filterStartDate)} s/d ${formatTanggalID(filterEndDate)}  •  ${classLabel}  •  ${subjectLabel}`,
      pageWidth / 2, startY + 9, { align: 'center' },
    );
    doc.text(
      `Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      pageWidth / 2, startY + 14, { align: 'center' },
    );

    // ==== KARTU RINGKASAN (4 kotak sejajar) ====
    const cardY = startY + 20;
    const gap = 4;
    const cardW = (pageWidth - 28 - gap * 3) / 4;
    const cardH = 16;
    const cards: {
      label: string;
      value: number;
      fg: [number, number, number];
      bg: [number, number, number];
    }[] = [
      { label: 'TOTAL TIDAK HADIR', value: totalAbsent, fg: [31, 41, 55], bg: [243, 244, 246] },
      { label: 'IZIN', value: absentByReason.izin.length, ...STATUS_PALETTE.Izin },
      { label: 'SAKIT', value: absentByReason.sakit.length, ...STATUS_PALETTE.Sakit },
      { label: 'ALPA', value: absentByReason.alpa.length, ...STATUS_PALETTE.Alpa },
    ];
    cards.forEach((c, i) => {
      const x = 14 + i * (cardW + gap);
      doc.setFillColor(...c.bg);
      doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'F');
      doc.setTextColor(...c.fg);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text(c.label, x + cardW / 2, cardY + 5, { align: 'center' });
      doc.setFontSize(14);
      doc.text(String(c.value), x + cardW / 2, cardY + 13, { align: 'center' });
    });
    doc.setTextColor(0, 0, 0);

    // ==== GRAFIK PER KELAS ====
    const afterChartY = drawClassChart(doc, classChartData, cardY + cardH + 10);

    // ==== DATA TABEL ====
    const cleanNotesForAbsent = (notes: string | null) => {
      if (!notes) return '-';
      return (
        notes
          .replace(/\[Absensi Pertama\]/gi, '')
          .replace(/\[Default Wali Kelas.*?\]/gi, '')
          .replace(/\[Override dari.*?\]/gi, '')
          .trim() || '-'
      );
    };

    const allAbsent = [
      ...absentByReason.izin.map((r) => ({ ...r, type: 'Izin' })),
      ...absentByReason.sakit.map((r) => ({ ...r, type: 'Sakit' })),
      ...absentByReason.alpa.map((r) => ({ ...r, type: 'Alpa' })),
    ].sort((a, b) => {
      const c = shortClass(a.students?.classes?.name).localeCompare(
        shortClass(b.students?.classes?.name), 'id', { numeric: true },
      );
      if (c !== 0) return c;
      const n = (a.students?.full_name || '').localeCompare(b.students?.full_name || '', 'id');
      if (n !== 0) return n;
      return a.date.localeCompare(b.date);
    });

    const tableData = allAbsent.map((r, i) => [
      i + 1,
      formatTanggalID(r.date),
      r.students?.nis || '-',
      toTitleCase(r.students?.full_name || '-'),
      shortClass(r.students?.classes?.name),
      r.type,
      cleanNotesForAbsent(r.notes),
    ]);

    let tableTitleY = afterChartY;
    if (tableTitleY > pageHeight - 50) { doc.addPage(); tableTitleY = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('DAFTAR SISWA TIDAK HADIR', 14, tableTitleY);

    autoTable(doc, {
      startY: tableTitleY + 4,
      head: [['No', 'Tanggal', 'NIS', 'Nama Siswa', 'Kelas', 'Status', 'Catatan']],
      body: tableData,
      theme: 'grid',
      margin: { left: 14, right: 14, bottom: 18 },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
        lineColor: [209, 213, 219],
        lineWidth: 0.1,
        textColor: [17, 24, 39],
        valign: 'middle',
      },
      headStyles: {
        fillColor: [31, 41, 55],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 8.5,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 9 },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'center', cellWidth: 22 },
        3: { cellWidth: 44 },
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'center', cellWidth: 18 },
        6: { cellWidth: 'auto' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 5) return;
        const p = STATUS_PALETTE[String(data.cell.raw || '')];
        if (!p) return;
        data.cell.styles.fillColor = p.bg;
        data.cell.styles.textColor = p.fg;
        data.cell.styles.fontStyle = 'bold';
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY;

    // ==== SIMPAN LAPORAN ====
    const reportData = {
      verification: 'DOKUMEN VALID',
      type: 'Rekap Siswa Tidak Hadir',
      school: schoolSettings?.school_name,
      period: `${filterStartDate} s/d ${filterEndDate}`,
      summary: {
        totalAbsent,
        izin: absentByReason.izin.length,
        sakit: absentByReason.sakit.length,
        alpa: absentByReason.alpa.length,
      },
      classSummary: classChartData,
      students: allAbsent.map((r) => ({
        nis: r.students?.nis,
        nama: toTitleCase(r.students?.full_name || ''),
        kelas: shortClass(r.students?.classes?.name),
        status: r.type,
        tanggal: r.date,
        catatan: cleanNotesForAbsent(r.notes),
      })),
      printDate: new Date().toISOString(),
      totalRecords: allAbsent.length,
    };

    const rawToken = generateSecureToken();
    const tokenHash = await sha256Hex(rawToken);

    const { data: serialData, error: serialError } = await supabase.rpc('generate_report_serial');
    if (serialError) {
      console.error('Error generating serial:', serialError);
      toast.error('Gagal menggenerate nomor seri laporan');
      return;
    }

    const { error: insertError } = await supabase.from('verified_reports').insert({
      serial_number: serialData,
      report_type: 'absent_recap',
      report_data: reportData,
      created_by: user?.id,
      token_hash: tokenHash,
      token_expires_at: null,
      revoked_at: null,
      access_count: 0,
    });
    if (insertError) {
      console.error('Error saving report:', insertError);
      toast.error('Gagal menyimpan data laporan untuk verifikasi');
      return;
    }

    // ==== QR VERIFIKASI ====
    const qrSize = 30;
    const qrPad = 4;
    const boxSize = qrSize + qrPad * 2;
    const qrX = pageWidth - boxSize - 14;
    let qrY = finalY + 10;

    if (qrY + boxSize + 6 > pageHeight - 15) {
      doc.addPage();
      qrY = 20;
    }

    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(qrX, qrY, boxSize, boxSize, 2, 2, 'FD');

    await addVerificationQR(doc, buildVerificationUrl(rawToken), qrX + qrPad, qrY + qrPad, qrSize);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(22, 101, 52);
    doc.text('DOKUMEN TERVERIFIKASI', 14, qrY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text('Scan QR Code di samping untuk memverifikasi keaslian', 14, qrY + 11);
    doc.text('dokumen dan melihat data siswa tidak hadir secara real-time.', 14, qrY + 15);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Dokumen berlaku selama arsip sekolah aktif.', 14, qrY + 21);
    doc.text(`No. Seri: ${serialData}`, 14, qrY + 26);

    // ==== FOOTER: nomor halaman di semua halaman ====
    const totalPagesPdf = doc.getNumberOfPages();
    for (let i = 1; i <= totalPagesPdf; i++) {
      doc.setPage(i);
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.2);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text('Rekap Siswa Tidak Hadir', 14, pageHeight - 7);
      doc.text(`Halaman ${i} dari ${totalPagesPdf}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
    }
    doc.setTextColor(0, 0, 0);

    doc.save(`siswa-tidak-hadir-${filterStartDate}-${filterEndDate}.pdf`);
    toast.success('Laporan berhasil dicetak dengan QR verifikasi aman');
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'hadir': return 'badge-hadir';
      case 'terlambat': return 'bg-orange-500/10 text-orange-600 border border-orange-500/20';
      case 'sakit': return 'badge-sakit';
      case 'izin': return 'badge-izin';
      case 'alpa': return 'badge-alpa';
      default: return 'bg-gray-500/10 text-gray-600 border border-gray-500/20';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'hadir': return 'Hadir';
      case 'terlambat': return 'Terlambat';
      case 'sakit': return 'Sakit';
      case 'izin': return 'Izin';
      case 'alpa': return 'Alpa';
      default: return status;
    }
  };

  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const currentYearNum = new Date().getFullYear();

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
            {(userRole === 'teacher' || userRole === 'guru_piket' || userRole === 'kesiswaan' || userRole === 'admin') && (
              <>
                <Button
                  className="bg-gradient-primary gap-2"
                  onClick={() => {
                    if (!isDayAllowed && !isFullAccessRole) {
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

                {isMobile ? (
                  <Drawer open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DrawerContent className="max-h-[90vh] mx-auto">
                      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-primary" />
                          <span className="font-bold text-base">Isi Absensi</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setIsDialogOpen(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex-1 overflow-y-auto px-4 py-3 max-h-[calc(90vh-140px)]">
                        <div className="space-y-3">
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-sm font-semibold">Jadwal Pelajaran</Label>
                              <Select value={selectedSchedule} onValueChange={setSelectedSchedule}>
                                <SelectTrigger className="h-11 border-2 text-sm w-full">
                                  <SelectValue placeholder="Pilih jadwal" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[250px] w-[calc(100vw-32px)]" position="popper" side="bottom" align="start">
                                  {schedules?.map((schedule: any) => (
                                    <SelectItem key={schedule.id} value={schedule.id} className="py-2.5">
                                      <div className="flex flex-col">
                                        <span className="font-medium text-sm">{schedule.classes?.name} - {schedule.subject}</span>
                                        <span className="text-xs text-muted-foreground">{schedule.start_time} - {schedule.end_time}</span>
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
                              <div className="grid grid-cols-5 gap-2">
                                <div className="bg-muted/50 rounded-lg p-2 text-center">
                                  <p className="text-lg font-bold">{attendanceStatsDialog.total}</p>
                                  <p className="text-[10px] text-muted-foreground">Total</p>
                                </div>
                                <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                                  <p className="text-lg font-bold text-green-700">{attendanceStatsDialog.hadir}</p>
                                  <p className="text-[10px] text-green-700">Hadir</p>
                                </div>
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-center">
                                  <p className="text-lg font-bold text-orange-700">{attendanceStatsDialog.terlambat}</p>
                                  <p className="text-[10px] text-orange-700">Tlmt</p>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
                                  <p className="text-lg font-bold text-amber-700">{attendanceStatsDialog.sakit}</p>
                                  <p className="text-[10px] text-amber-700">Sakit</p>
                                </div>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center">
                                  <p className="text-lg font-bold text-blue-700">{attendanceStatsDialog.izin}</p>
                                  <p className="text-[10px] text-blue-700">Izin</p>
                                </div>
                              </div>
                              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Hadir')} className="shrink-0 gap-1 h-9">
                                  <CheckCircle2 className="w-3 h-3" /> Semua Hadir
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Terlambat')} className="shrink-0 gap-1 h-9">
                                  <Clock className="w-3 h-3" /> Semua Tlmt
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Sakit')} className="shrink-0 gap-1 h-9">
                                  <Stethoscope className="w-3 h-3" /> Semua Sakit
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Izin')} className="shrink-0 gap-1 h-9">
                                  <Clock className="w-3 h-3" /> Semua Izin
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Alpa')} className="shrink-0 gap-1 h-9">
                                  <XCircle className="w-3 h-3" /> Semua Alpa
                                </Button>
                              </div>
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                  placeholder="Cari siswa..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm"
                                />
                              </div>
                              <div className="space-y-3">
                                {filteredStudents.map((student) => {
                                  const currentStatus = attendanceData[student.id]?.status || 'Hadir';
                                  return (
                                    <Card key={student.id} className="border shadow-sm">
                                      <CardContent className="p-3 space-y-3">
                                        <div className="flex items-center gap-3">
                                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${getStatusColor(currentStatus)}`}>
                                            {toTitleCase(student.full_name).charAt(0)}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <h3 className="font-medium text-sm truncate">{toTitleCase(student.full_name)}</h3>
                                            <p className="text-xs text-muted-foreground">NIS: {student.nis}</p>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-5 gap-1.5">
                                          {['Hadir', 'Terlambat', 'Sakit', 'Izin', 'Alpa'].map((status) => (
                                            <Button
                                              key={status}
                                              size="sm"
                                              variant={currentStatus === status ? 'default' : 'outline'}
                                              className={`h-9 text-xs px-1 ${currentStatus === status ? `${getStatusColor(status)} text-white border-0` : ''}`}
                                              onClick={() => updateAttendanceStatus(student.id, status)}
                                            >
                                              {status === 'Hadir' && 'H'}
                                              {status === 'Terlambat' && 'T'}
                                              {status === 'Sakit' && 'S'}
                                              {status === 'Izin' && 'I'}
                                              {status === 'Alpa' && 'A'}
                                            </Button>
                                          ))}
                                        </div>
                                        {currentStatus !== 'Hadir' && currentStatus !== 'Terlambat' && (
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
                              <strong>Sistem Hybrid:</strong> Guru yang mengabsen pertama kali akan menjadi data default. Status dapat diubah jika berbeda. Siswa yang tap RFID terlambat akan otomatis tercatat sebagai "Terlambat" (dihitung sebagai Hadir).
                            </AlertDescription>
                          </Alert>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold">Jadwal Pelajaran</Label>
                              <Select value={selectedSchedule} onValueChange={setSelectedSchedule}>
                                <SelectTrigger className="h-12 border-2">
                                  <SelectValue placeholder="Pilih jadwal pelajaran" />
                                </SelectTrigger>
                                <SelectContent>
                                  {schedules?.map((schedule: any) => (
                                    <SelectItem key={schedule.id} value={schedule.id}>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{schedule.classes?.name} - {schedule.subject}</span>
                                        <span className="text-xs text-muted-foreground">{schedule.start_time} - {schedule.end_time}</span>
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
                                      <p className="text-xs text-orange-700">Terlambat</p>
                                      <p className="text-2xl font-bold text-orange-700">{attendanceStatsDialog.terlambat}</p>
                                    </div>
                                    <Clock className="w-8 h-8 text-orange-600" />
                                  </CardContent>
                                </Card>
                                <Card className="bg-amber-50 border-amber-200 border">
                                  <CardContent className="p-4 flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-amber-700">Sakit</p>
                                      <p className="text-2xl font-bold text-amber-700">{attendanceStatsDialog.sakit}</p>
                                    </div>
                                    <Stethoscope className="w-8 h-8 text-amber-600" />
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
                              </div>
                              <div className="flex flex-wrap gap-2 p-4 bg-muted/30 rounded-lg">
                                <p className="text-sm font-semibold w-full mb-2">Quick Actions:</p>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Hadir')} className="gap-2">
                                  <CheckCircle2 className="w-4 h-4" /> Semua Hadir
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Terlambat')} className="gap-2">
                                  <Clock className="w-4 h-4" /> Semua Terlambat
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Sakit')} className="gap-2">
                                  <Stethoscope className="w-4 h-4" /> Semua Sakit
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Izin')} className="gap-2">
                                  <Clock className="w-4 h-4" /> Semua Izin
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => quickMarkAll('Alpa')} className="gap-2">
                                  <XCircle className="w-4 h-4" /> Semua Alpa
                                </Button>
                              </div>
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <input
                                  placeholder="Cari nama atau NIS siswa..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="flex h-12 w-full rounded-md border-2 border-input bg-background px-3 py-2 pl-10 text-sm"
                                />
                              </div>
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
                                        <div className="flex items-start gap-3">
                                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${getStatusColor(currentStatus)}`}>
                                            {toTitleCase(student.full_name).charAt(0).toUpperCase()}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-base truncate">{toTitleCase(student.full_name)}</h3>
                                            <p className="text-sm text-muted-foreground">NIS: {student.nis}</p>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          {['Hadir', 'Terlambat', 'Sakit', 'Izin', 'Alpa'].map((status) => (
                                            <Button
                                              key={status}
                                              size="sm"
                                              variant={currentStatus === status ? 'default' : 'outline'}
                                              className={`gap-2 transition-all ${currentStatus === status ? `${getStatusColor(status)} text-white` : 'hover:border-primary'}`}
                                              onClick={() => updateAttendanceStatus(student.id, status)}
                                            >
                                              {getStatusIcon(status)}
                                              {status}
                                            </Button>
                                          ))}
                                        </div>
                                        {currentStatus !== 'Hadir' && currentStatus !== 'Terlambat' && (
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
                      <div className="flex items-center justify-between p-6 border-t bg-muted/30">
                        <div className="text-sm text-muted-foreground">
                          {selectedSchedule && students && (
                            <span className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4" />
                              {attendanceStatsDialog.hadir} hadir, {attendanceStatsDialog.terlambat} terlambat dari {attendanceStatsDialog.total} siswa
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
              <div className="flex flex-wrap gap-1.5 md:gap-2">
                <Button variant="outline" size="sm" onClick={handleThisWeek} className="gap-1 h-8 text-[11px] px-2 md:h-9 md:text-sm md:px-3">
                  <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5" /> Minggu Ini
                </Button>
                <Button variant="outline" size="sm" onClick={handleThisMonth} className="gap-1 h-8 text-[11px] px-2 md:h-9 md:text-sm md:px-3">
                  <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5" /> Bulan Ini
                </Button>
                <Select value={selectedMonth} onValueChange={handleMonthSelect}>
                  <SelectTrigger className="w-[110px] md:w-[180px] h-8 md:h-9 text-[11px] md:text-sm">
                    <SelectValue placeholder="Pilih Bulan" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthNames.map((month, idx) => (
                      <SelectItem key={month} value={`${currentYearNum}-${String(idx + 1).padStart(2, '0')}`}>
                        {month} {currentYearNum}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-4">
                <div className="grid grid-cols-2 gap-2 md:contents">
                  <div className="space-y-1">
                    <Label className="text-[11px] md:text-sm">Tanggal Mulai</Label>
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => { setFilterStartDate(e.target.value); setSelectedMonth(''); setCurrentPage(1); }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs md:text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] md:text-sm">Tanggal Akhir</Label>
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => { setFilterEndDate(e.target.value); setSelectedMonth(''); setCurrentPage(1); }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs md:text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:contents">
                  <div className="space-y-1">
                    <Label className="text-[11px] md:text-sm">Kelas</Label>
                    <Select value={filterClass} onValueChange={(v) => { setFilterClass(v); setCurrentPage(1); }}>
                      <SelectTrigger className="h-9 text-xs md:text-sm">
                        <SelectValue placeholder="Semua Kelas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Kelas</SelectItem>
                        {classes?.map((cls: any) => (
                          <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] md:text-sm">Mata Pelajaran</Label>
                    <Select value={filterSubject} onValueChange={(v) => { setFilterSubject(v); setCurrentPage(1); }}>
                      <SelectTrigger className="h-9 text-xs md:text-sm">
                        <SelectValue placeholder="Semua Mapel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Mapel</SelectItem>
                        {subjects?.map((subject: any) => (
                          <SelectItem key={subject} value={subject}>{subject}</SelectItem>
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
        <div className="grid grid-cols-2 gap-3 md:gap-6 md:grid-cols-5">
          <Card className="card-hover border-none shadow-md">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Hadir</p>
                  <p className="text-xl md:text-3xl font-bold text-green-600">{stats.hadir}</p>
                  <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1">Termasuk terlambat</p>
                </div>
                <div className="badge-hadir w-8 h-8 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-sm md:text-lg font-bold">H</div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover border-none shadow-md">
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">Terlambat</p>
                  <p className="text-xl md:text-3xl font-bold text-orange-600">{stats.terlambat}</p>
                  <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1">Dihitung sebagai hadir</p>
                </div>
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-sm md:text-lg font-bold bg-orange-500/10 text-orange-600 border border-orange-500/20">T</div>
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
                <div className="badge-izin w-8 h-8 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-sm md:text-lg font-bold">I</div>
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
                <div className="badge-sakit w-8 h-8 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-sm md:text-lg font-bold">S</div>
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
                <div className="badge-alpa w-8 h-8 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-sm md:text-lg font-bold">A</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2">
          <Card className="card-hover border-none shadow-md">
            <CardHeader className="pb-2 md:pb-6">
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-primary" /> Grafik Kehadiran
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
                <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" /> Distribusi Kehadiran
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
                    label={(entry: any) => `${entry.name}: ${entry.value}`}
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

        {/* Grafik Kehadiran per Kelas */}
        <Card className="card-hover border-none shadow-md">
          <CardHeader className="pb-2 md:pb-6">
            <CardTitle className="flex items-center gap-2 text-sm md:text-base">
              <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-primary" /> Kehadiran per Kelas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-6">
            {classChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(220, classChartData.length * 36 + 60)}>
                <BarChart data={classChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="kelas" width={70} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Hadir" stackId="a" fill={COLORS.Hadir} />
                  <Bar dataKey="Terlambat" stackId="a" fill={COLORS.Terlambat} />
                  <Bar dataKey="Izin" stackId="a" fill={COLORS.Izin} />
                  <Bar dataKey="Sakit" stackId="a" fill={COLORS.Sakit} />
                  <Bar dataKey="Alpa" stackId="a" fill={COLORS.Alpa} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Tidak ada data</p>
            )}
          </CardContent>
        </Card>

        {/* Absent Students List */}
        <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3">
          <Card className="card-hover border-none shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserX className="h-5 w-5 text-blue-600" /> Siswa Izin ({absentByReason.izin.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {absentByReason.izin.length > 0 ? (
                  absentByReason.izin.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{toTitleCase(record.students?.full_name || '')}</p>
                        <p className="text-xs text-muted-foreground">{shortClass(record.students?.classes?.name)}</p>
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
                <UserX className="h-5 w-5 text-yellow-600" /> Siswa Sakit ({absentByReason.sakit.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {absentByReason.sakit.length > 0 ? (
                  absentByReason.sakit.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{toTitleCase(record.students?.full_name || '')}</p>
                        <p className="text-xs text-muted-foreground">{shortClass(record.students?.classes?.name)}</p>
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
                <UserX className="h-5 w-5 text-red-600" /> Siswa Alpa ({absentByReason.alpa.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {absentByReason.alpa.length > 0 ? (
                  absentByReason.alpa.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{toTitleCase(record.students?.full_name || '')}</p>
                        <p className="text-xs text-muted-foreground">{shortClass(record.students?.classes?.name)}</p>
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
                <ClipboardCheck className="h-4 w-4 md:h-5 md:w-5 text-primary" /> Rekap Detail Absensi
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
                      <Button variant="ghost" size="sm" onClick={() => handleSort('date')} className="flex items-center gap-1 -ml-4 hover:bg-transparent">
                        Tanggal <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>NIS</TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => handleSort('name')} className="flex items-center gap-1 -ml-4 hover:bg-transparent">
                        Nama <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => handleSort('class')} className="flex items-center gap-1 -ml-4 hover:bg-transparent">
                        Kelas <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>Mata Pelajaran</TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => handleSort('status')} className="flex items-center gap-1 -ml-4 hover:bg-transparent">
                        Status <ArrowUpDown className="h-4 w-4" />
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
                          <TableCell>{formatTanggalID(record.date)}</TableCell>
                          <TableCell>{record.students?.nis}</TableCell>
                          <TableCell className="font-medium">{toTitleCase(record.students?.full_name || '')}</TableCell>
                          <TableCell>{shortClass(record.students?.classes?.name)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{record.schedules?.subject || '-'}</TableCell>
                          <TableCell>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(record.status)}`}>
                              {getStatusLabel(record.status)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isOverride ? (
                              <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">Override</Badge>
                            ) : isDefault ? (
                              <Badge variant="secondary">Default WK</Badge>
                            ) : isFirstRecord ? (
                              <Badge variant="outline" className="border-green-500 text-green-700">Pertama</Badge>
                            ) : (
                              <Badge variant="outline">Manual</Badge>
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
              {totalPages > 1 && (
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pt-4">
                  <p className="text-xs md:text-sm text-muted-foreground text-center md:text-left">
                    Halaman {currentPage} dari {totalPages}
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="gap-1">
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">Sebelumnya</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="gap-1">
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
