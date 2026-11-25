import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { ScheduleCombobox } from '@/components/ScheduleCombobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, ClipboardCheck, Filter, Printer, Download, BarChart3, Users, UserX, FileText,
  Search, CheckCircle2, XCircle, Clock, Stethoscope, User, TrendingUp, Calendar,
  ArrowUpDown, ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Info, X,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { DuplicateAttendanceManager } from '@/components/DuplicateAttendanceManager';
import { AttendanceInfographicDialog } from '@/components/attendance/AttendanceInfographicDialog';
import {
  UI_STATUSES, STATUS_UI, lazyRowStyle, StatusPill, Avatar, StatTile, RateRing, SectionCard, StatusRadioGroup,
  type UiStatus,
} from '@/components/attendance/AttendanceUi';
import type { InfoRecord } from '@/lib/attendanceInfographic';
import {
  useAttendanceDaySettings,
  isAttendanceAllowedForDate,
  getActiveDayNames,
} from '@/hooks/useAttendanceDaySettings';
import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF, addSignatureToPDF } from '@/lib/pdfLetterhead';
import { notifyBotIfAttendanceComplete } from '@/lib/waBot';
import { fetchAttendanceChunked } from '@/lib/fetchAttendanceRange';
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
  jumlahSiswa?: number;
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

/** Normalisasi jenis kelamin dari berbagai kemungkinan nama kolom/nilai */
type GenderKey = 'L' | 'P' | '?';
const normGender = (s: any): GenderKey => {
  const v = String(s?.gender ?? s?.jenis_kelamin ?? s?.sex ?? '').trim().toLowerCase();
  if (['l', 'laki-laki', 'laki laki', 'lk', 'male', 'm', 'pria'].includes(v)) return 'L';
  if (['p', 'perempuan', 'pr', 'female', 'f', 'wanita'].includes(v)) return 'P';
  return '?';
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
 * Grafik kehadiran per kelas + rekap angka (jumlah siswa, izin, sakit, alpa, total)
 * dalam satu blok, digambar langsung di jsPDF. Return: posisi Y berikutnya.
 */
const drawClassChart = (doc: any, data: ClassRow[], startY: number): number => {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 14;
  const right = pageW - 14;
  const hasSiswa = data.some((r) => r.jumlahSiswa !== undefined);
  const wLabel = 15;
  const wSiswa = hasSiswa ? 15 : 0;
  const wPct = 12;
  const wNum = 11;
  const wTot = 14;
  // tepi kanan tiap kolom angka
  const eTot = right;
  const eAlpa = right - wTot;
  const eSakit = eAlpa - wNum;
  const eIzin = eSakit - wNum;
  const ePct = eIzin - wNum;
  const eSiswa = left + wLabel + wSiswa;
  const barX = eSiswa + 2;
  const barW = ePct - wPct - 1 - barX;
  const barH = 4.6;
  const rowH = barH + 2.4;
  const keys = Object.keys(STATUS_RGB) as StatusKey[];
  const pad = 1.5;
  let y = startY;

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text('Kelas', left, y);
    if (hasSiswa) doc.text('Siswa', eSiswa - pad, y, { align: 'right' });
    doc.text('% Hadir', ePct - pad, y, { align: 'right' });
    doc.setTextColor(...STATUS_RGB.Izin);
    doc.text('Izin', eIzin - pad, y, { align: 'right' });
    doc.setTextColor(...STATUS_RGB.Sakit);
    doc.text('Sakit', eSakit - pad, y, { align: 'right' });
    doc.setTextColor(...STATUS_RGB.Alpa);
    doc.text('Alpa', eAlpa - pad, y, { align: 'right' });
    doc.setTextColor(90, 90, 90);
    doc.text('Total', eTot, y, { align: 'right' });
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.2);
    doc.line(left, y + 1.5, right, y + 1.5);
    y += 5;
  };

  const ensure = (h: number) => {
    if (y + h > pageH - 18) {
      doc.addPage();
      y = 20;
      drawHeader();
    }
  };

  const drawNum = (v: number, edge: number, rgb: [number, number, number], bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    if (v === 0) {
      doc.setTextColor(170, 170, 170);
      doc.text('-', edge - pad, y + barH - 1.2, { align: 'right' });
    } else {
      doc.setTextColor(...rgb);
      doc.text(String(v), edge - pad, y + barH - 1.2, { align: 'right' });
    }
  };

  const drawRow = (row: ClassRow, label: string, bold: boolean) => {
    const total = keys.reduce((sum, k) => sum + row[k], 0);
    const hadirPct = total ? Math.round(((row.Hadir + row.Terlambat) / total) * 100) : null;
    const absent = row.Izin + row.Sakit + row.Alpa;

    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(label, left, y + barH - 1.2, { maxWidth: wLabel + wSiswa - 2 });
    if (hasSiswa) {
      doc.text(row.jumlahSiswa !== undefined ? String(row.jumlahSiswa) : '-', eSiswa - pad, y + barH - 1.2, { align: 'right' });
    }

    doc.setFillColor(243, 244, 246);
    doc.rect(barX, y, barW, barH, 'F');
    let x = barX;
    keys.forEach((k) => {
      const v = row[k];
      if (!v || !total) return;
      const w = (v / total) * barW;
      doc.setFillColor(...STATUS_RGB[k]);
      doc.rect(x, y, w, barH, 'F');
      if (w > 5) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(255, 255, 255);
        doc.text(String(v), x + w / 2, y + barH - 1.3, { align: 'center' });
      }
      x += w;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(hadirPct === null ? '-' : `${hadirPct}%`, ePct - pad, y + barH - 1.2, { align: 'right' });
    drawNum(row.Izin, eIzin, STATUS_RGB.Izin);
    drawNum(row.Sakit, eSakit, STATUS_RGB.Sakit);
    drawNum(row.Alpa, eAlpa, STATUS_RGB.Alpa);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(String(absent), eTot, y + barH - 1.2, { align: 'right' });
  };

  ensure(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('GRAFIK KEHADIRAN PER KELAS', left, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('% Hadir = (Hadir + Terlambat) dari seluruh data absensi pada periode. Total = Izin + Sakit + Alpa.', left, y);
  y += 5;

  // legenda warna
  let lx = left;
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  keys.forEach((k) => {
    doc.setFillColor(...STATUS_RGB[k]);
    doc.rect(lx, y - 2.8, 3, 3, 'F');
    doc.text(k, lx + 4.5, y - 0.3);
    lx += doc.getTextWidth(k) + 12;
  });
  y += 6;

  drawHeader();

  data.forEach((row) => {
    ensure(rowH);
    drawRow(row, row.kelas, false);
    y += rowH;
  });

  // baris total semua kelas
  ensure(rowH + 3);
  const all: ClassRow = {
    kelas: 'Semua Kelas',
    Hadir: 0, Terlambat: 0, Izin: 0, Sakit: 0, Alpa: 0,
    jumlahSiswa: hasSiswa ? data.reduce((sum, r) => sum + (r.jumlahSiswa || 0), 0) : undefined,
  };
  data.forEach((r) => keys.forEach((k) => { all[k] += r[k]; }));
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.3);
  doc.line(left, y - 0.5, right, y - 0.5);
  y += 1.5;
  drawRow(all, 'Semua Kelas', true);
  y += rowH;

  doc.setTextColor(0, 0, 0);
  return y + 4;
};

const Attendance = () => {
  const { userRole, user } = useAuth();
  const { selectedYear, selectedSemester } = useAcademicYear();
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

  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [infographicOpen, setInfographicOpen] = useState(false);
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
  const [loadProgress, setLoadProgress] = useState<{ done: number; total: number } | null>(null);
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

  // Hanya jadwal pada tahun ajaran & semester yang sedang difilter.
  // Jadwal lama tanpa isian semester tetap ikut agar tidak hilang.
  const { data: schedules } = useQuery({
    queryKey: ['teacher-schedules', user?.id, userRole, selectedYear, selectedSemester],
    queryFn: async () => {
      if (!selectedYear) return [];
      const semesterFilter = `semester.eq.${selectedSemester},semester.is.null`;
      if (isFullAccessRole) {
        const { data, error } = await supabase
          .from('schedules')
          .select(`*, classes(id, name), teachers!inner(id, user_id)`)
          .eq('academic_year', selectedYear)
          .eq('is_active', true)
          .or(semesterFilter)
          .order('day_of_week');
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
        .eq('teacher_id', teacher.id)
        .eq('academic_year', selectedYear)
        .eq('is_active', true)
        .or(semesterFilter)
        .order('day_of_week');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!userRole && !!selectedYear,
  });

  // Tautan langsung dari Jurnal Mengajar: /attendance?schedule=<id>&date=<yyyy-MM-dd>
  // → pilih jadwal & tanggal itu lalu langsung buka form Isi Absensi.
  React.useEffect(() => {
    const scheduleParam = searchParams.get('schedule');
    if (!scheduleParam || !schedules) return;
    const dateParam = searchParams.get('date');
    const found = (schedules as any[]).some((sc) => sc.id === scheduleParam);
    const next = new URLSearchParams(searchParams);
    next.delete('schedule');
    next.delete('date');
    setSearchParams(next, { replace: true });
    if (!found) {
      toast.error('Jadwal tidak ditemukan pada tahun ajaran / semester yang dipilih');
      return;
    }
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) setSelectedDate(dateParam);
    setSelectedSchedule(scheduleParam);
    setIsDialogOpen(true);
  }, [searchParams, schedules, setSearchParams]);

  // Jadwal terpilih yang tidak lagi ada di daftar (ganti tahun/semester) dikosongkan
  React.useEffect(() => {
    if (selectedSchedule && schedules && !schedules.some((sc: any) => sc.id === selectedSchedule)) {
      setSelectedSchedule('');
    }
  }, [schedules, selectedSchedule]);

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

  const { data: attendanceRecords, error: attendanceError, isFetching: attendanceFetching } = useQuery({
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

      // Rentang panjang (berbulan-bulan) berisi puluhan ribu baris. Diambil per potongan 3 hari dengan paginasi
      // kecil + percobaan ulang (lihat fetchAttendanceRange.ts) agar tidak kena batas waktu server.
      const teacherFilter = userRole === 'teacher' && scheduleIds.length > 0
        ? `schedule_id.in.(${scheduleIds.join(',')}),and(schedule_id.is.null,sched_teacher_id.eq.${user?.id})`
        : null;
      setLoadProgress(null);
      const rows: any[] = await fetchAttendanceChunked<any>(filterStartDate, filterEndDate, async (cs, ce, from, to) => {
        let query = supabase
          .from('attendance')
          .select(`*, students!inner(id, full_name, nis, class_id, status, gender, classes(name)), schedules(subject)`)
          .gte('date', cs).lte('date', ce).eq('students.status', 'aktif');

        if (teacherFilter) query = query.or(teacherFilter);
        if (studentIds) query = query.in('student_id', studentIds);
        // id sebagai pengurut kedua agar urutan antarhalaman stabil (tidak ada baris ganda/hilang)
        const { data, error } = await query
          .order('date', { ascending: false }).order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data || [];
      }, { concurrency: 6, onProgress: (done, total) => setLoadProgress({ done, total }) });

      if (filterSubject !== 'all') return rows.filter((r) => (r.schedules?.subject || (r as any).sched_subject) === filterSubject);
      return rows;
    },
    enabled: !!userRole && (isFullAccessRole || !!user?.id),
  });

  React.useEffect(() => {
    if (attendanceError) {
      toast.error('Gagal memuat data absensi untuk rentang tanggal ini. Periksa koneksi lalu coba lagi, atau persempit rentang tanggal.');
      console.error('Gagal memuat absensi:', attendanceError);
    }
  }, [attendanceError]);

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

  // Satu tahun pelajaran penuh (1 Juli – 30 Juni) mengikuti Tahun Pelajaran yang dipilih di bilah atas.
  // Akhir rentang dibatasi sampai hari ini agar tidak meminta data hari yang belum terjadi.
  const handleSchoolYear = () => {
    const today = new Date();
    const m = /^(\d{4})/.exec(selectedYear || '');
    const startYear = m ? parseInt(m[1], 10) : (today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1);
    const start = new Date(startYear, 6, 1);
    const end = new Date(startYear + 1, 5, 30);
    setFilterStartDate(toISODate(start));
    setFilterEndDate(toISODate(end > today ? today : end));
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

  /** Data untuk infografis (sesuai filter aktif) */
  const infographicRecords = React.useMemo<InfoRecord[]>(() => deduplicatedRecords.map((r) => ({
    student_id: r.student_id,
    date: r.date,
    status: r.status,
    name: toTitleCase(r.students?.full_name || ''),
    className: r.students?.classes?.name ? shortClass(r.students.classes.name) : 'Tanpa Kelas',
    gender: normGender(r.students),
  })), [deduplicatedRecords]);
  const infographicClasses = React.useMemo(() => {
    const list = filterClass !== 'all'
      ? (classes || []).filter((c: any) => c.id === filterClass)
      : (classes || []);
    return list.map((c: any) => shortClass(c.name));
  }, [classes, filterClass]);
  const infographicScope = [
    filterClass !== 'all' ? `Kelas ${shortClass(classes?.find((c: any) => c.id === filterClass)?.name)}` : 'Semua kelas',
    filterSubject !== 'all' ? filterSubject : 'Semua mapel',
  ].join(' · ');

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
      toast.success('✓ Absensi berhasil disimpan dan otomatis tercatat pada guru lain di kelas & hari yang sama');
      notifyBotIfAttendanceComplete();
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
    if (deduplicatedRecords.length > 20000) {
      toast.error(`Laporan terlalu besar untuk PDF (${deduplicatedRecords.length.toLocaleString('id-ID')} baris). Gunakan Export CSV, Rekap per mapel, atau persempit rentang tanggal.`);
      return;
    }
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
    // Rentang > 62 hari: kolom per tanggal tidak muat di kertas, jadi hanya total H/T/S/I/A per siswa.
    const showDayColumns = dates.length <= 62;
    if (!showDayColumns) toast.info('Rentang lebih dari 62 hari: rekap dicetak sebagai total per siswa (tanpa kolom per tanggal).');
    const dayNumbers = showDayColumns ? dates.map((date) => parseInt(date.slice(8, 10), 10)) : [];
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

    const recordsByStudent = new Map<string, any[]>();
    deduplicatedRecords.forEach((r) => {
      const list = recordsByStudent.get(r.student_id);
      if (list) list.push(r); else recordsByStudent.set(r.student_id, [r]);
    });
    const studentStats = studentsList.map((student: any) => {
      const studentRecords = recordsByStudent.get(student.id) || [];
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
      if (showDayColumns) dates.forEach((date) => { row.push(studentAttendance.get(date) || '-'); });
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

    // ==== DATA SISWA: jumlah per kelas & jenis kelamin ====
    const classIdsForTotal: string[] =
      filterClass !== 'all' ? [filterClass] : (classes || []).map((c: any) => c.id);
    let allStudents: any[] = [];
    let studentsLoaded = false;
    if (classIdsForTotal.length > 0) {
      try {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase
            .from('students')
            .select('*, classes(name)')
            .in('class_id', classIdsForTotal)
            .eq('status', 'aktif')
            .eq('is_alumni', false)
            .order('id')
            .range(from, from + 999);
          if (error) throw error;
          allStudents = allStudents.concat(data || []);
          if (!data || data.length < 1000) break;
        }
        studentsLoaded = true;
      } catch (e) {
        console.error('Gagal memuat jumlah siswa:', e);
        toast.warning('Jumlah siswa per kelas gagal dimuat, rekap ditampilkan tanpa total siswa');
      }
    }

    type Agg = { total: number; izin: number; sakit: number; alpa: number };
    const emptyAgg = (): Agg => ({ total: 0, izin: 0, sakit: 0, alpa: 0 });
    const classAgg = new Map<string, Agg>();
    const getClassAgg = (k: string) => {
      if (!classAgg.has(k)) classAgg.set(k, emptyAgg());
      return classAgg.get(k)!;
    };
    const genderAgg: Record<GenderKey, Agg> = { L: emptyAgg(), P: emptyAgg(), '?': emptyAgg() };
    const genderOf = new Map<string, GenderKey>();

    allStudents.forEach((st) => {
      const g = normGender(st);
      genderOf.set(st.id, g);
      getClassAgg(shortClass(st.classes?.name)).total++;
      genderAgg[g].total++;
    });

    [
      ...absentByReason.izin.map((r) => ({ r, key: 'izin' as const })),
      ...absentByReason.sakit.map((r) => ({ r, key: 'sakit' as const })),
      ...absentByReason.alpa.map((r) => ({ r, key: 'alpa' as const })),
    ].forEach(({ r, key }) => {
      getClassAgg(shortClass(r.students?.classes?.name))[key]++;
      genderAgg[genderOf.get(r.student_id) ?? '?'][key]++;
    });

    const sumAbs = (a: Agg) => a.izin + a.sakit + a.alpa;
    const classRows = Array.from(classAgg.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'id', { numeric: true }))
      .map(([kelas, a]) => ({ kelas, jumlahSiswa: a.total, izin: a.izin, sakit: a.sakit, alpa: a.alpa, totalTidakHadir: sumAbs(a) }));
    const classTotals = classRows.reduce(
      (t, r) => ({
        jumlahSiswa: t.jumlahSiswa + r.jumlahSiswa,
        izin: t.izin + r.izin,
        sakit: t.sakit + r.sakit,
        alpa: t.alpa + r.alpa,
        totalTidakHadir: t.totalTidakHadir + r.totalTidakHadir,
      }),
      { jumlahSiswa: 0, izin: 0, sakit: 0, alpa: 0, totalTidakHadir: 0 },
    );
    const genderLabels: Record<GenderKey, string> = { L: 'Laki-laki', P: 'Perempuan', '?': 'Tidak diketahui' };
    const genderRows = (['L', 'P', '?'] as GenderKey[])
      .filter((g) => g !== '?' || genderAgg['?'].total > 0 || sumAbs(genderAgg['?']) > 0)
      .map((g) => ({
        jenisKelamin: genderLabels[g],
        jumlahSiswa: genderAgg[g].total,
        izin: genderAgg[g].izin,
        sakit: genderAgg[g].sakit,
        alpa: genderAgg[g].alpa,
        totalTidakHadir: sumAbs(genderAgg[g]),
      }));
    const genderTotals = genderRows.reduce(
      (t, r) => ({
        jumlahSiswa: t.jumlahSiswa + r.jumlahSiswa,
        izin: t.izin + r.izin,
        sakit: t.sakit + r.sakit,
        alpa: t.alpa + r.alpa,
        totalTidakHadir: t.totalTidakHadir + r.totalTidakHadir,
      }),
      { jumlahSiswa: 0, izin: 0, sakit: 0, alpa: 0, totalTidakHadir: 0 },
    );
    const siswaCell = (n: number) => (studentsLoaded ? n : '-');

    const recapTableBase = {
      theme: 'grid' as const,
      margin: { left: 14, right: 14, bottom: 18 },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 },
        lineColor: [209, 213, 219] as [number, number, number],
        lineWidth: 0.1,
        textColor: [17, 24, 39] as [number, number, number],
        valign: 'middle' as const,
        halign: 'center' as const,
      },
      headStyles: {
        fillColor: [31, 41, 55] as [number, number, number],
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: 'bold' as const,
        halign: 'center' as const,
      },
      footStyles: {
        fillColor: [229, 231, 235] as [number, number, number],
        textColor: [17, 24, 39] as [number, number, number],
        fontStyle: 'bold' as const,
        halign: 'center' as const,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
      columnStyles: { 0: { halign: 'left' as const, cellWidth: 40 } },
      didParseCell: (data: any) => {
        if (data.section === 'head' && data.column.index >= 2 && data.column.index <= 4) {
          const k = ['Izin', 'Sakit', 'Alpa'][data.column.index - 2] as StatusKey;
          data.cell.styles.fillColor = STATUS_RGB[k];
        }
      },
    };

    let recapY = cardY + cardH + 10;
    if (recapY > pageHeight - 60) { doc.addPage(); recapY = 20; }

    // ---- Grafik + rekap per kelas (digabung dalam satu blok) ----
    const classKeySet = new Set<string>([
      ...classRows.map((r) => r.kelas),
      ...classChartData.map((c) => (c.kelas === 'Tanpa Kelas' ? '-' : c.kelas)),
    ]);
    const chartRows: ClassRow[] = Array.from(classKeySet)
      .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }))
      .map((kelas) => {
        const cr = classRows.find((r) => r.kelas === kelas);
        const cc = classChartData.find((c) => c.kelas === kelas || (kelas === '-' && c.kelas === 'Tanpa Kelas'));
        return {
          kelas: kelas === '-' ? 'Tanpa Kelas' : kelas,
          Hadir: cc?.Hadir ?? 0,
          Terlambat: cc?.Terlambat ?? 0,
          Izin: cr?.izin ?? cc?.Izin ?? 0,
          Sakit: cr?.sakit ?? cc?.Sakit ?? 0,
          Alpa: cr?.alpa ?? cc?.Alpa ?? 0,
          jumlahSiswa: studentsLoaded ? cr?.jumlahSiswa ?? 0 : undefined,
        };
      });
    recapY = drawClassChart(doc, chartRows, recapY) + 4;

    // ---- Rekap berdasarkan jenis kelamin ----
    if (recapY > pageHeight - 55) { doc.addPage(); recapY = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('REKAP SISWA TIDAK HADIR BERDASARKAN JENIS KELAMIN', 14, recapY);
    autoTable(doc, {
      ...recapTableBase,
      startY: recapY + 4,
      head: [['Jenis Kelamin', 'Jumlah Siswa', 'Izin', 'Sakit', 'Alpa', 'Total Tidak Hadir']],
      body: genderRows.map((r) => [r.jenisKelamin, siswaCell(r.jumlahSiswa), r.izin, r.sakit, r.alpa, r.totalTidakHadir]),
      foot: [[
        'Jumlah', siswaCell(genderTotals.jumlahSiswa),
        genderTotals.izin, genderTotals.sakit, genderTotals.alpa, genderTotals.totalTidakHadir,
      ]],
    });
    let afterChartY = (doc as any).lastAutoTable.finalY + 4;
    if (filterStartDate !== filterEndDate) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(
        'Catatan: jumlah Izin/Sakit/Alpa dihitung per catatan absensi; siswa yang sama dapat tercatat pada beberapa hari.',
        14, afterChartY + 2,
      );
      afterChartY += 4;
    }
    afterChartY += 6;
    doc.setTextColor(0, 0, 0);

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
    classRecap: { rows: classRows, totals: classTotals },
    genderRecap: { rows: genderRows, totals: genderTotals },
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

  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const currentYearNum = new Date().getFullYear();

  // ---------- Nilai turunan & potongan JSX untuk tampilan ----------
  const totalRecords = stats.hadir + stats.izin + stats.sakit + stats.alpa;
  const ratePct = totalRecords > 0 ? (stats.hadir / totalRecords) * 100 : null;
  const periodText =
    filterStartDate === filterEndDate
      ? formatTanggalID(filterStartDate)
      : `${formatTanggalID(filterStartDate)} – ${formatTanggalID(filterEndDate)}`;
  const canFillAttendance = userRole === 'teacher' || userRole === 'guru_piket' || userRole === 'kesiswaan' || userRole === 'admin';
  const resetDialog = () => {
    setIsDialogOpen(false);
    setAttendanceData({});
    setSelectedSchedule('');
    setSearchQuery('');
  };
  const openFillDialog = () => {
    if (!isDayAllowed && !isFullAccessRole) {
      toast.error(`Absensi tidak dapat diisi pada hari ini. Hari yang diizinkan: ${activeDayNames.join(', ')}`);
      return;
    }
    setIsDialogOpen(true);
  };

  const recordTypeBadge = (record: any) => {
    const notes: string = record.notes || '';
    if (notes.includes('[Override dari')) return <Badge className="bg-purple-500 hover:bg-purple-600">Override</Badge>;
    if (notes.includes('[Default Wali Kelas')) return <Badge variant="secondary">Default WK</Badge>;
    if (notes.includes('[Absensi Pertama]')) return <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400">Pertama</Badge>;
    return <Badge variant="outline">Manual</Badge>;
  };
  const recordCleanNotes = (record: any) => {
    const raw: string = record.notes || '';
    if (!raw) return '-';
    return (
      raw
        .replace(/\[Absensi Pertama\]/g, '')
        .replace(/\[Default Wali Kelas[^\]]*\]/g, '')
        .replace(/\[Override dari[^\]]*\]/g, '')
        .trim() || '-'
    );
  };

  /** Isi formulir absensi: dipakai bersama oleh Drawer (ponsel) dan Dialog (desktop). */
  const attendanceFormBody = (
    <div className="space-y-4">
      <Alert className="border-primary/20 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          <strong>Sistem Hybrid:</strong> guru yang mengabsen pertama menjadi data default; status bisa diubah bila berbeda.
          Siswa yang tap RFID terlambat otomatis tercatat "Terlambat" (dihitung Hadir).
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Jadwal Pelajaran</Label>
          <ScheduleCombobox schedules={(schedules ?? []) as any} value={selectedSchedule} onChange={setSelectedSchedule} placeholder="Pilih jadwal pelajaran" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="att-date" className="text-sm font-semibold">Tanggal</Label>
          <Input id="att-date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-10" />
        </div>
      </div>

      {selectedSchedule && students && students.length > 0 && (
        <>
          {existingAttendance && existingAttendance.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3" role="status">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-500 text-white">
                <ClipboardCheck className="h-4 w-4" />
              </span>
              <div className="text-sm">
                <p className="font-semibold">Data absensi ditemukan</p>
                <p className="text-muted-foreground">
                  {existingAttendance.length} siswa sudah punya data untuk tanggal {selectedDate}; dimuat sebagai default.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="status" aria-live="polite">
            <div className="rounded-lg bg-muted/60 px-2 py-2 text-center">
              <div className="text-lg font-bold tabular-nums">{attendanceStatsDialog.total}</div>
              <div className="text-[11px] text-muted-foreground">Total</div>
            </div>
            {UI_STATUSES.map((s) => (
              <div key={s} className={`rounded-lg px-2 py-2 text-center ${STATUS_UI[s].bg}`}>
                <div className={`text-lg font-bold tabular-nums ${STATUS_UI[s].text}`}>
                  {attendanceStatsDialog[s.toLowerCase() as 'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alpa']}
                </div>
                <div className="text-[11px] text-muted-foreground">{STATUS_UI[s].label}</div>
              </div>
            ))}
          </div>

          <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {UI_STATUSES.map((s) => {
              const Icon = STATUS_UI[s].icon;
              return (
                <Button key={s} size="sm" variant="outline" onClick={() => quickMarkAll(s)} className="h-9 shrink-0 snap-start gap-1.5">
                  <Icon className={`h-3.5 w-3.5 ${STATUS_UI[s].text}`} aria-hidden="true" />
                  Semua {STATUS_UI[s].label}
                </Button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              inputMode="search"
              placeholder="Cari nama atau NIS siswa…"
              aria-label="Cari siswa"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-9"
            />
          </div>

          <ul className="grid gap-2 lg:grid-cols-2">
            {filteredStudents.map((student, idx) => {
              const cur = attendanceData[student.id]?.status || 'Hadir';
              const curUi = (UI_STATUSES as string[]).includes(cur) ? STATUS_UI[cur as UiStatus] : null;
              return (
                <li key={student.id} style={lazyRowStyle(112)} className="space-y-2 rounded-xl border bg-card p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Avatar name={student.full_name} tone={curUi ? `${curUi.solid} text-white` : undefined} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{toTitleCase(student.full_name)}</p>
                      <p className="text-xs text-muted-foreground">NIS {student.nis}</p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
                  </div>
                  <StatusRadioGroup
                    name={`status-${student.id}`}
                    label={`Status kehadiran ${toTitleCase(student.full_name)}`}
                    value={cur}
                    onChange={(s) => updateAttendanceStatus(student.id, s)}
                  />
                  {cur !== 'Hadir' && cur !== 'Terlambat' && (
                    <Input
                      placeholder="Catatan (opsional)"
                      aria-label={`Catatan ${toTitleCase(student.full_name)}`}
                      value={attendanceData[student.id]?.notes || ''}
                      onChange={(e) => updateAttendanceNotes(student.id, e.target.value)}
                      className="h-9 text-sm"
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {filteredStudents.length === 0 && (
            <div className="py-10 text-center">
              <Search className="mx-auto mb-2 h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Tidak ada siswa yang cocok dengan pencarian</p>
            </div>
          )}
        </>
      )}

      {selectedSchedule && (!students || students.length === 0) && (
        <div className="rounded-xl bg-muted/30 py-10 text-center">
          <Users className="mx-auto mb-2 h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Tidak ada siswa dalam kelas ini</p>
        </div>
      )}
      {!selectedSchedule && (
        <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 py-10 text-center">
          <TrendingUp className="mx-auto mb-2 h-10 w-10 text-primary" aria-hidden="true" />
          <p className="font-semibold text-balance">Pilih jadwal untuk memulai</p>
          <p className="mx-auto max-w-xs text-xs text-muted-foreground text-balance">Pilih jadwal pelajaran dan tanggal, lalu isi status tiap siswa.</p>
        </div>
      )}
    </div>
  );

  const attendanceFooter = (
    <div className="flex flex-col gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between md:p-4">
      <p className="hidden text-sm text-muted-foreground sm:block" aria-live="polite">
        {selectedSchedule && students
          ? `${attendanceStatsDialog.hadir} hadir, ${attendanceStatsDialog.terlambat} terlambat dari ${attendanceStatsDialog.total} siswa`
          : ''}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={resetDialog} className="flex-1 sm:flex-none">
          Batal
        </Button>
        <Button
          onClick={handleSubmitAttendance}
          disabled={!selectedSchedule || !students || students.length === 0 || createAttendanceMutation.isPending}
          className="flex-1 gap-2 bg-gradient-primary sm:min-w-36 sm:flex-none"
        >
          {createAttendanceMutation.isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-white motion-reduce:animate-none" aria-hidden="true" />
              Menyimpan…
            </>
          ) : (
            <>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Simpan Absensi
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-4 motion-safe:animate-fade-in md:space-y-6">
        {/* HEADER */}
        <header className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-primary/5 p-4 md:p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:grid">
                <ClipboardCheck className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">{isFullAccessRole ? 'Pantau semua kelas' : 'Guru mata pelajaran'}</p>
                <h1 className="text-xl font-bold text-balance md:text-3xl">Absensi Siswa</h1>
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 text-xs md:text-sm">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {periodText}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-3">
                <RateRing pct={ratePct} />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Tingkat kehadiran</p>
                  <p className="tabular-nums">{totalRecords} catatan</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isFullAccessRole && <DuplicateAttendanceManager />}
                <Button variant="outline" size="sm" onClick={() => setInfographicOpen(true)} className="gap-2">
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Infografis</span>
                  <span className="sr-only sm:hidden">Infografis</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Cetak &amp; Ekspor</span>
                      <span className="sr-only sm:hidden">Cetak dan ekspor</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => setTimeout(handlePrint, 200)}><Printer className="mr-2 h-4 w-4" /> Cetak</DropdownMenuItem>
                    <DropdownMenuItem onSelect={handlePrintAbsent}><UserX className="mr-2 h-4 w-4" /> Cetak Tidak Hadir</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={handleExportPDF}><FileText className="mr-2 h-4 w-4" /> PDF Detail</DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleExportRekapPDF}><FileText className="mr-2 h-4 w-4" /> PDF Rekap</DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleExport}><Download className="mr-2 h-4 w-4" /> CSV</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {canFillAttendance && (
                  <>
                    <Button className="gap-2 bg-gradient-primary shadow-sm" size="sm" onClick={openFillDialog}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Isi Absensi</span>
                      <span className="sm:hidden">Absen</span>
                    </Button>

                    {isMobile ? (
                      <Drawer open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DrawerContent className="mx-auto flex max-h-[92dvh] flex-col">
                          <div className="flex items-center justify-between border-b bg-background px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-5 w-5 text-primary" aria-hidden="true" />
                              <span className="text-base font-bold">Isi Absensi</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setIsDialogOpen(false)} aria-label="Tutup">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{attendanceFormBody}</div>
                          {attendanceFooter}
                        </DrawerContent>
                      </Drawer>
                    ) : (
                      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent className="flex max-h-[92dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
                          <DialogHeader className="border-b p-4 text-left md:p-6">
                            <DialogTitle className="flex items-center gap-2 text-xl">
                              <Calendar className="h-5 w-5 text-primary" aria-hidden="true" />
                              Isi Absensi Siswa
                            </DialogTitle>
                          </DialogHeader>
                          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-6">{attendanceFormBody}</div>
                          {attendanceFooter}
                        </DialogContent>
                      </Dialog>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* FILTER */}
        <SectionCard title="Filter Data" icon={<Filter className="h-4 w-4 text-primary md:h-5 md:w-5" aria-hidden="true" />}>
          <div className="space-y-3">
            <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              <Button variant="secondary" size="sm" onClick={handleThisWeek} className="h-9 shrink-0 snap-start rounded-full">Minggu Ini</Button>
              <Button variant="secondary" size="sm" onClick={handleThisMonth} className="h-9 shrink-0 snap-start rounded-full">Bulan Ini</Button>
              <Button variant="secondary" size="sm" onClick={handleSchoolYear} className="h-9 shrink-0 snap-start rounded-full">
                Tahun Pelajaran{selectedYear ? ` ${selectedYear}` : ''}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <div className="space-y-1">
                <Label className="text-xs">Bulan</Label>
                <Select value={selectedMonth} onValueChange={handleMonthSelect}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Pilih bulan" /></SelectTrigger>
                  <SelectContent>
                    {monthNames.map((month, idx) => (
                      <SelectItem key={month} value={`${currentYearNum}-${String(idx + 1).padStart(2, '0')}`}>
                        {month} {currentYearNum}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-start" className="text-xs">Tanggal Mulai</Label>
                <Input id="f-start" type="date" className="h-10" value={filterStartDate}
                  onChange={(e) => { setFilterStartDate(e.target.value); setSelectedMonth(''); setCurrentPage(1); }} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-end" className="text-xs">Tanggal Akhir</Label>
                <Input id="f-end" type="date" className="h-10" value={filterEndDate}
                  onChange={(e) => { setFilterEndDate(e.target.value); setSelectedMonth(''); setCurrentPage(1); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kelas</Label>
                <Select value={filterClass} onValueChange={(v) => { setFilterClass(v); setCurrentPage(1); }}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Semua Kelas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kelas</SelectItem>
                    {classes?.map((cls: any) => (<SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1 lg:col-span-1">
                <Label className="text-xs">Mata Pelajaran</Label>
                <Select value={filterSubject} onValueChange={(v) => { setFilterSubject(v); setCurrentPage(1); }}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Semua Mapel" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Mapel</SelectItem>
                    {subjects?.map((subject: any) => (<SelectItem key={subject} value={subject}>{subject}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* STATISTIK */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-1">
            <StatTile kind="Hadir" value={stats.hadir} total={totalRecords} note="Termasuk terlambat" />
          </div>
          <StatTile kind="Terlambat" value={stats.terlambat} total={totalRecords} note="Dihitung sebagai hadir" />
          <StatTile kind="Izin" value={stats.izin} total={totalRecords} />
          <StatTile kind="Sakit" value={stats.sakit} total={totalRecords} />
          <StatTile kind="Alpa" value={stats.alpa} total={totalRecords} />
        </div>

        {/* GRAFIK */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <SectionCard title="Grafik Kehadiran" icon={<BarChart3 className="h-4 w-4 text-primary md:h-5 md:w-5" aria-hidden="true" />}>
            {totalRecords === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data pada periode ini.</p>
            ) : (
              <div className="h-52 md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                    <XAxis dataKey="status" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                    <Bar dataKey="jumlah" radius={[8, 8, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                      {barChartData.map((d) => (<Cell key={d.status} fill={COLORS[d.status as keyof typeof COLORS]} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Distribusi Kehadiran" icon={<Users className="h-4 w-4 text-primary md:h-5 md:w-5" aria-hidden="true" />}>
            {totalRecords === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data pada periode ini.</p>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="relative h-44 w-44 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData.filter((d) => d.value > 0)} cx="50%" cy="50%" innerRadius={52} outerRadius={78}
                        paddingAngle={3} cornerRadius={4} dataKey="value" stroke="none" isAnimationActive={false}>
                        {chartData.filter((d) => d.value > 0).map((entry) => (<Cell key={entry.name} fill={entry.color} />))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <div className="text-2xl font-bold tabular-nums">{totalRecords}</div>
                      <div className="text-[11px] text-muted-foreground">catatan</div>
                    </div>
                  </div>
                </div>
                <ul className="w-full space-y-2 text-sm">
                  {chartData.map((d) => (
                    <li key={d.name} className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} aria-hidden="true" />
                        {d.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        <b className="text-foreground">{d.value}</b>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>
        </div>

        {/* KEHADIRAN PER KELAS */}
        <SectionCard title="Kehadiran per Kelas" icon={<BarChart3 className="h-4 w-4 text-primary md:h-5 md:w-5" aria-hidden="true" />}>
          {classChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, classChartData.length * 36 + 60)}>
              <BarChart data={classChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="kelas" width={70} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                <Legend />
                <Bar dataKey="Hadir" stackId="a" fill={COLORS.Hadir} isAnimationActive={false} />
                <Bar dataKey="Terlambat" stackId="a" fill={COLORS.Terlambat} isAnimationActive={false} />
                <Bar dataKey="Izin" stackId="a" fill={COLORS.Izin} isAnimationActive={false} />
                <Bar dataKey="Sakit" stackId="a" fill={COLORS.Sakit} isAnimationActive={false} />
                <Bar dataKey="Alpa" stackId="a" fill={COLORS.Alpa} radius={[0, 6, 6, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada data</p>
          )}
        </SectionCard>

        {/* SISWA TIDAK HADIR */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {([
            { key: 'izin', ui: 'Izin', empty: 'Tidak ada siswa izin' },
            { key: 'sakit', ui: 'Sakit', empty: 'Tidak ada siswa sakit' },
            { key: 'alpa', ui: 'Alpa', empty: 'Tidak ada siswa alpa' },
          ] as const).map(({ key, ui, empty }) => {
            const list = absentByReason[key];
            const m = STATUS_UI[ui];
            return (
              <SectionCard
                key={key}
                title={`Siswa ${m.label}`}
                icon={<UserX className={`h-4 w-4 md:h-5 md:w-5 ${m.text}`} aria-hidden="true" />}
                action={<span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${m.bg} ${m.text}`}>{list.length}</span>}
              >
                <ul className="max-h-64 space-y-2 overflow-y-auto overscroll-contain">
                  {list.length > 0 ? (
                    list.map((record) => (
                      <li key={record.id} style={lazyRowStyle(60)} className="flex items-center gap-3 rounded-lg border p-2.5">
                        <Avatar name={record.students?.full_name || ''} tone={`${m.bg} ${m.text}`} size="h-8 w-8" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{toTitleCase(record.students?.full_name || '')}</p>
                          <p className="text-xs text-muted-foreground">{shortClass(record.students?.classes?.name)}</p>
                        </div>
                        <StatusPill status={ui} />
                      </li>
                    ))
                  ) : (
                    <li className="py-4 text-center text-sm text-muted-foreground">{empty}</li>
                  )}
                </ul>
              </SectionCard>
            );
          })}
        </div>

        {/* REKAP DETAIL */}
        <SectionCard
          title="Rekap Detail Absensi"
          icon={<ClipboardCheck className="h-4 w-4 text-primary md:h-5 md:w-5" aria-hidden="true" />}
          description={
            attendanceFetching
              ? `Memuat data… ${loadProgress ? `${Math.round((loadProgress.done / Math.max(1, loadProgress.total)) * 100)}% (${loadProgress.done}/${loadProgress.total} potongan)` : ''}`
              : `Menampilkan ${paginatedRecords.length} dari ${sortedRecords.length} data`
          }
        >
          {/* Ponsel: kartu */}
          <ul className="space-y-2 md:hidden">
            {paginatedRecords && paginatedRecords.length > 0 ? (
              paginatedRecords.map((record) => (
                <li key={`${record.student_id}-${record.students?.class_id}-${record.date}`} style={lazyRowStyle(96)} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{toTitleCase(record.students?.full_name || '')}</p>
                      <p className="text-xs text-muted-foreground">
                        {shortClass(record.students?.classes?.name)} · {record.schedules?.subject || record.sched_subject || '-'}
                      </p>
                    </div>
                    <StatusPill status={record.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatTanggalID(record.date)}</span>
                    {recordTypeBadge(record)}
                  </div>
                  {recordCleanNotes(record) !== '-' && <p className="mt-1.5 text-xs">{recordCleanNotes(record)}</p>}
                </li>
              ))
            ) : (
              <li className="py-8 text-center text-sm text-muted-foreground">Tidak ada data absensi</li>
            )}
          </ul>

          {/* Layar lebar: tabel */}
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead aria-sort={undefined}>
                    <Button variant="ghost" size="sm" onClick={() => handleSort('date')} className="-ml-3 gap-1 hover:bg-transparent">
                      Tanggal <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </TableHead>
                  <TableHead>NIS</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => handleSort('name')} className="-ml-3 gap-1 hover:bg-transparent">
                      Nama <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => handleSort('class')} className="-ml-3 gap-1 hover:bg-transparent">
                      Kelas <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </TableHead>
                  <TableHead>Mata Pelajaran</TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => handleSort('status')} className="-ml-3 gap-1 hover:bg-transparent">
                      Status <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRecords && paginatedRecords.length > 0 ? (
                  paginatedRecords.map((record) => (
                    <TableRow key={`${record.student_id}-${record.students?.class_id}-${record.date}`} className="hover:bg-muted/40">
                      <TableCell className="whitespace-nowrap text-sm">{formatTanggalID(record.date)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{record.students?.nis}</TableCell>
                      <TableCell className="text-sm font-medium">{toTitleCase(record.students?.full_name || '')}</TableCell>
                      <TableCell className="text-sm">{shortClass(record.students?.classes?.name)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{record.schedules?.subject || record.sched_subject || '-'}</TableCell>
                      <TableCell><StatusPill status={record.status} /></TableCell>
                      <TableCell>{recordTypeBadge(record)}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground" title={recordCleanNotes(record)}>{recordCleanNotes(record)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Tidak ada data absensi</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <nav aria-label="Halaman rekap" className="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between">
              <p className="text-center text-xs text-muted-foreground md:text-left md:text-sm">Halaman {currentPage} dari {totalPages}</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="gap-1">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Sebelumnya</span>
                  <span className="sr-only sm:hidden">Sebelumnya</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="gap-1">
                  <span className="hidden sm:inline">Selanjutnya</span>
                  <span className="sr-only sm:hidden">Selanjutnya</span>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </nav>
          )}
        </SectionCard>
      </div>
      <AttendanceInfographicDialog
        open={infographicOpen}
        onClose={() => setInfographicOpen(false)}
        records={infographicRecords}
        allClasses={infographicClasses}
        startDate={filterStartDate}
        endDate={filterEndDate}
        scopeLabel={infographicScope}
        schoolName={(schoolSettings as any)?.school_name || 'SMP Negeri 8 Ciamis'}
      />
    </DashboardLayout>
  );
};

export default Attendance;
