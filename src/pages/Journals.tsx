import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Pencil, Printer, Download, ArrowUpDown, ArrowRight, Eye, Loader2, Search } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { DataPagination } from '@/components/ui/data-pagination';
import { generateSecureToken, sha256Hex, buildVerificationUrl } from '@/lib/reportVerification';
import {
  buildJournalPdf, csvCell, type PaperSize, formatTanggalID, formatTanggalPanjang, jamLabel, shortClass, shortTime,
  type JournalRow,
} from '@/lib/journalReport';

type SortField = 'date' | 'teacher' | 'schedule' | 'present';

/** Tanggal lokal → yyyy-MM-dd (toISOString memakai UTC sehingga bisa mundur sehari di WIB) */
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const monthRange = () => {
  const n = new Date();
  return [toISODate(new Date(n.getFullYear(), n.getMonth(), 1)), toISODate(new Date(n.getFullYear(), n.getMonth() + 1, 0))];
};

const Journals = () => {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingJournal, setEditingJournal] = useState<any>(null);
  const [periodPreset, setPeriodPreset] = useState('month');
  const [startDate, setStartDate] = useState(() => monthRange()[0]);
  const [endDate, setEndDate] = useState(() => monthRange()[1]);
  const [filterSchedule, setFilterSchedule] = useState('all');
  const [filterTeacher, setFilterTeacher] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [paper, setPaper] = useState<PaperSize>(() => {
    try { return localStorage.getItem('journal-paper') === 'f4' ? 'f4' : 'a4'; } catch { return 'a4'; }
  });
  const [hasAttendanceData, setHasAttendanceData] = useState<boolean | null>(null);
  const [isCheckingAttendance, setIsCheckingAttendance] = useState(false);
  // Absensi mapel lain (kelas & tanggal sama) yang bisa dipakai bila jadwal ini belum punya absensi
  const [previousAttendance, setPreviousAttendance] = useState<{
    label: string; present: number; absent: number;
  } | null>(null);
  const [usingPrevious, setUsingPrevious] = useState(false);
  const [formData, setFormData] = useState({
    schedule_id: '',
    date: toISODate(new Date()),
    material: '',
    activity: '',
    students_present: 0,
    students_absent: 0,
    notes: '',
  });

  const { data: schedules } = useQuery({
    queryKey: ['teacher-schedules-journal', user?.id, userRole],
    queryFn: async () => {
      if (userRole === 'admin') {
        const { data, error } = await supabase
          .from('schedules')
          .select('*, classes(id, name, grade)')
          .eq('is_active', true)
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
        if (!teacher) return [];

        const { data, error } = await supabase
          .from('schedules')
          .select('*, classes(id, name, grade)')
          .eq('teacher_id', teacher.id)
          .eq('is_active', true)
          .order('day_of_week');
        
        if (error) throw error;
        return data;
      }
    },
    enabled: !!user?.id && !!userRole,
  });

  // ===== Data guru (nama dari profiles, NIP dari teachers) — 1 query, bukan N+1 =====
  const { data: teacherList, isError: isTeacherListError } = useQuery({
    queryKey: ['journal-teachers', userRole, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('id, nip, user_id, profiles:profiles!teachers_user_id_profiles_fkey(full_name)');
      if (error) throw error;
      return (data || []).map((t: any) => ({
        id: t.id as string,
        user_id: t.user_id as string,
        nip: (t.nip as string | null) || null,
        name: (Array.isArray(t.profiles) ? t.profiles[0]?.full_name : t.profiles?.full_name) || '-',
      }));
    },
    enabled: !!userRole && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: classList } = useQuery({
    queryKey: ['journal-classes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('classes').select('id, name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const myTeacher = teacherList?.find((t) => t.user_id === user?.id) || null;

  const { data: rawJournals, isLoading: isLoadingJournals, isError: isJournalsError } = useQuery({
    queryKey: ['teaching-journals', userRole, user?.id, startDate, endDate, myTeacher?.id],
    queryFn: async () => {
      let scheduleIds: string[] | null = null;
      if (userRole !== 'admin') {
        if (!myTeacher) return [];
        const { data: ts, error: tsErr } = await supabase
          .from('schedules')
          .select('id')
          .eq('teacher_id', myTeacher.id);
        if (tsErr) throw tsErr;
        scheduleIds = (ts || []).map((s) => s.id);
        if (scheduleIds.length === 0) return [];
      }

      // Ambil bertahap (batas 1000 baris per request) agar data tidak terpotong
      const PAGE = 1000;
      const all: any[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = supabase
          .from('teaching_journals')
          .select('*, schedules(subject, start_time, end_time, class_id, teacher_id, classes(name))')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (startDate) q = q.gte('date', startDate);
        if (endDate) q = q.lte('date', endDate);
        if (scheduleIds) q = q.in('schedule_id', scheduleIds);
        const { data, error } = await q;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      return all;
    },
    enabled: !!userRole && !!user?.id && (userRole === 'admin' || teacherList !== undefined || isTeacherListError),
    placeholderData: (prev) => prev,
  });

  // Normalisasi: pakai jadwal bila ada, jika jadwal sudah dihapus pakai snapshot di jurnal
  const journals: JournalRow[] = useMemo(() => {
    const tMap = new Map((teacherList || []).map((t) => [t.id, t]));
    const cMap = new Map((classList || []).map((c: any) => [c.id, c.name as string]));
    return (rawJournals || []).map((j: any) => {
      const s = j.schedules;
      const teacherId = s?.teacher_id || j.sched_teacher_id || null;
      const t = teacherId ? tMap.get(teacherId) : undefined;
      const classId = s?.class_id || j.sched_class_id;
      return {
        id: j.id,
        date: j.date,
        schedule_id: j.schedule_id,
        teacher_id: teacherId,
        teacher_name: t?.name || '-',
        teacher_nip: t?.nip || null,
        subject: s?.subject || j.sched_subject || '-',
        class_name: s?.classes?.name || (classId ? cMap.get(classId) : '') || '-',
        start_time: s?.start_time || j.sched_start_time || '',
        end_time: s?.end_time || j.sched_end_time || '',
        material: j.material || '',
        activity: j.activity || '',
        students_present: j.students_present || 0,
        students_absent: j.students_absent || 0,
        notes: j.notes || '',
      } as JournalRow;
    });
  }, [rawJournals, teacherList, classList]);


  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('teaching_journals').insert([{ ...data, created_by: user?.id }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teaching-journals'] });
      toast({ title: 'Jurnal berhasil ditambahkan' });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: 'Gagal menambahkan jurnal', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: any) => {
      const { error } = await supabase.from('teaching_journals').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teaching-journals'] });
      toast({ title: 'Jurnal berhasil diperbarui' });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: 'Gagal memperbarui jurnal', variant: 'destructive' });
    },
  });

  // Fetch attendance data when schedule and date change
  useEffect(() => {
    const fetchAttendanceData = async () => {
      // Don't auto-fetch if editing existing journal
      setPreviousAttendance(null);
      setUsingPrevious(false);
      if (!formData.schedule_id || !formData.date) {
        setHasAttendanceData(null);
        return;
      }

      if (editingJournal) {
        setHasAttendanceData(true);
        return;
      }
      
      setIsCheckingAttendance(true);
      
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('student_id, status, created_at')
          .eq('schedule_id', formData.schedule_id)
          .eq('date', formData.date)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Check if there's any attendance data
        if (!data || data.length === 0) {
          setHasAttendanceData(false);
          setFormData(prev => ({
            ...prev,
            students_present: 0,
            students_absent: 0,
          }));
          // Cari absensi mapel lain di kelas & tanggal yang sama
          try {
            const cur = schedules?.find((sc: any) => sc.id === formData.schedule_id) as any;
            if (cur?.class_id) {
              const { data: sibs } = await supabase
                .from('schedules')
                .select('id, subject, start_time')
                .eq('class_id', cur.class_id)
                .neq('id', formData.schedule_id);
              const sibIds = (sibs || []).map((x) => x.id);
              if (sibIds.length > 0) {
                const { data: prevRows } = await supabase
                  .from('attendance')
                  .select('schedule_id, student_id, status, created_at')
                  .in('schedule_id', sibIds)
                  .eq('date', formData.date)
                  .order('created_at', { ascending: false });
                if (prevRows && prevRows.length > 0) {
                  const bySched = new Map<string, any[]>();
                  prevRows.forEach((r) => {
                    if (!r.schedule_id) return;
                    bySched.set(r.schedule_id, [...(bySched.get(r.schedule_id) || []), r]);
                  });
                  // Pilih mapel terdekat sebelum jam ini; jika tidak ada, yang terakhir diisi
                  const cands = (sibs || []).filter((x) => bySched.has(x.id));
                  const before = cands
                    .filter((x) => (x.start_time || '') < (cur.start_time || ''))
                    .sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
                  const pick = before[0] || cands.sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''))[0];
                  if (pick) {
                    const uniq = new Map<string, string>();
                    bySched.get(pick.id)!.forEach((r) => { if (!uniq.has(r.student_id)) uniq.set(r.student_id, r.status); });
                    const sts = Array.from(uniq.values());
                    setPreviousAttendance({
                      label: `${pick.subject} (${shortTime(pick.start_time)})`,
                      present: sts.filter((x) => x === 'hadir').length,
                      absent: sts.filter((x) => x !== 'hadir').length,
                    });
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error mencari absensi sebelumnya:', e);
          }
          return;
        }
        
        // Deduplicate - keep only latest record per student
        const uniqueStudents = new Map();
        data.forEach((record) => {
          if (!uniqueStudents.has(record.student_id)) {
            uniqueStudents.set(record.student_id, record.status);
          }
        });
        
        // Count students
        const statuses = Array.from(uniqueStudents.values());
        const present = statuses.filter(s => s === 'hadir').length;
        const absent = statuses.filter(s => s !== 'hadir').length;
        
        setHasAttendanceData(true);
        setFormData(prev => ({
          ...prev,
          students_present: present,
          students_absent: absent,
        }));
      } catch (error) {
        console.error('Error fetching attendance:', error);
        setHasAttendanceData(false);
        toast({
          title: 'Gagal memeriksa data absensi',
          description: 'Terjadi kesalahan saat memeriksa data absensi.',
          variant: 'destructive'
        });
      } finally {
        setIsCheckingAttendance(false);
      }
    };
    
    fetchAttendanceData();
  }, [formData.schedule_id, formData.date, editingJournal, toast, schedules]);

  const resetForm = () => {
    setFormData({
      schedule_id: '',
      date: toISODate(new Date()),
      material: '',
      activity: '',
      students_present: 0,
      students_absent: 0,
      notes: '',
    });
    setEditingJournal(null);
    setHasAttendanceData(null);
    setIsCheckingAttendance(false);
    setPreviousAttendance(null);
    setUsingPrevious(false);
  };

  const usePreviousAttendance = () => {
    if (!previousAttendance) return;
    setHasAttendanceData(true);
    setUsingPrevious(true);
    setFormData((prev) => ({
      ...prev,
      students_present: previousAttendance.present,
      students_absent: previousAttendance.absent,
    }));
  };

  const createNewAttendance = () => {
    setIsDialogOpen(false);
    navigate(`/attendance?schedule=${encodeURIComponent(formData.schedule_id)}&date=${encodeURIComponent(formData.date)}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const journalData = {
      ...formData,
      students_present: parseInt(formData.students_present.toString()),
      students_absent: parseInt(formData.students_absent.toString()),
    };

    if (editingJournal) {
      updateMutation.mutate({ id: editingJournal.id, data: journalData });
    } else {
      createMutation.mutate(journalData);
    }
  };

  const handleEdit = (journal: JournalRow) => {
    setEditingJournal(journal);
    setFormData({
      schedule_id: journal.schedule_id || '',
      date: journal.date,
      material: journal.material,
      activity: journal.activity || '',
      students_present: journal.students_present || 0,
      students_absent: journal.students_absent || 0,
      notes: journal.notes || '',
    });
    setIsDialogOpen(true);
  };

  const getScheduleInfo = (j: JournalRow) =>
    `${j.subject} - ${shortClass(j.class_name)}${j.start_time ? ` - ${shortTime(j.start_time)}` : ''}`;

  const filteredJournals = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = journals.filter((j) => {
      if (filterSchedule !== 'all' && j.schedule_id !== filterSchedule) return false;
      if (filterTeacher !== 'all' && j.teacher_id !== filterTeacher) return false;
      if (q) {
        const hay = `${j.material} ${j.activity} ${j.notes} ${j.subject} ${j.class_name} ${j.teacher_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortOrder === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      let c = 0;
      switch (sortBy) {
        case 'teacher': c = a.teacher_name.localeCompare(b.teacher_name, 'id'); break;
        case 'schedule':
          c = `${a.subject} ${shortClass(a.class_name)}`.localeCompare(`${b.subject} ${shortClass(b.class_name)}`, 'id', { numeric: true });
          break;
        case 'present': c = a.students_present - b.students_present; break;
        default: c = a.date.localeCompare(b.date);
      }
      if (c === 0) c = a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time);
      return c * dir;
    });
  }, [journals, filterSchedule, filterTeacher, search, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredJournals.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedJournals = filteredJournals.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Kembali ke halaman 1 saat filter / urutan berubah
  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, filterSchedule, filterTeacher, search, sortBy, sortOrder, pageSize]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder(field === 'date' || field === 'present' ? 'desc' : 'asc');
    }
  };

  const applyPreset = (preset: string) => {
    setPeriodPreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (preset) {
      case 'today': setStartDate(toISODate(now)); setEndDate(toISODate(now)); break;
      case '7d': {
        const s = new Date(now); s.setDate(s.getDate() - 6);
        setStartDate(toISODate(s)); setEndDate(toISODate(now)); break;
      }
      case 'month': setStartDate(toISODate(new Date(y, m, 1))); setEndDate(toISODate(new Date(y, m + 1, 0))); break;
      case 'last_month': setStartDate(toISODate(new Date(y, m - 1, 1))); setEndDate(toISODate(new Date(y, m, 0))); break;
      case 'year': setStartDate(toISODate(new Date(y, 0, 1))); setEndDate(toISODate(new Date(y, 11, 31))); break;
      case 'all': setStartDate(''); setEndDate(''); break;
      default: break; // custom: biarkan tanggal apa adanya
    }
  };

  const invalidRange = !!startDate && !!endDate && startDate > endDate;

  const periodLabel = useMemo(() => {
    if (!startDate && !endDate) return 'Semua periode';
    if (startDate && endDate) {
      return startDate === endDate
        ? formatTanggalPanjang(startDate)
        : `${formatTanggalPanjang(startDate)} s/d ${formatTanggalPanjang(endDate)}`;
    }
    return startDate ? `Mulai ${formatTanggalPanjang(startDate)}` : `Sampai ${formatTanggalPanjang(endDate)}`;
  }, [startDate, endDate]);

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Penandatangan Guru Mapel: guru yang login, atau satu-satunya guru pada data terfilter
  const signer = useMemo(() => {
    if (userRole !== 'admin') return myTeacher ? { name: myTeacher.name, nip: myTeacher.nip } : null;
    const ids = new Set(filteredJournals.map((j) => j.teacher_id));
    if (ids.size === 1) {
      const j = filteredJournals[0];
      return { name: j.teacher_name, nip: j.teacher_nip };
    }
    return null;
  }, [userRole, myTeacher, filteredJournals]);

  const showTeacherColumn = userRole === 'admin';

  const filterLines = () => {
    const lines: string[] = [];
    if (filterTeacher !== 'all') {
      const t = teacherList?.find((x) => x.id === filterTeacher);
      if (t) lines.push(`Guru: ${t.name}`);
    } else if (userRole === 'admin') {
      lines.push('Guru: Semua guru');
    }
    if (filterSchedule !== 'all') {
      const s = schedules?.find((x) => x.id === filterSchedule);
      if (s) lines.push(`Jadwal: ${s.subject} - ${shortClass((s as any).classes?.name)} - ${shortTime(s.start_time)}`);
    }
    if (search.trim()) lines.push(`Pencarian: "${search.trim()}"`);
    lines.push(`Urutan: ${{ date: 'Tanggal', teacher: 'Guru', schedule: 'Mapel/Kelas', present: 'Siswa hadir' }[sortBy]} (${sortOrder === 'asc' ? 'naik' : 'turun'})`);
    return lines;
  };

  const pdfOptions = (paperOverride?: PaperSize) => ({
    paper: paperOverride || paper,
    rows: filteredJournals,
    settings: schoolSettings as any,
    periodLabel,
    filterLines: filterLines(),
    showTeacher: showTeacherColumn,
    signerTeacherName: signer?.name,
    signerTeacherNip: signer?.nip,
  });

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  };

  const changePaper = (p: PaperSize) => {
    setPaper(p);
    try { localStorage.setItem('journal-paper', p); } catch { /* abaikan */ }
    if (previewOpen) void handlePreview(p);
  };

  const handlePreview = async (paperOverride?: PaperSize) => {
    if (invalidRange) {
      toast({ title: 'Rentang tanggal tidak valid', description: 'Tanggal mulai tidak boleh setelah tanggal akhir.', variant: 'destructive' });
      return;
    }
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const doc = await buildJournalPdf(pdfOptions(paperOverride));
      const url = URL.createObjectURL(doc.output('blob'));
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    } catch (err) {
      console.error('Preview error:', err);
      toast({ title: 'Gagal membuat pratinjau', variant: 'destructive' });
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (invalidRange) {
      toast({ title: 'Rentang tanggal tidak valid', description: 'Tanggal mulai tidak boleh setelah tanggal akhir.', variant: 'destructive' });
      return;
    }
    if (filteredJournals.length === 0) {
      toast({ title: 'Tidak ada jurnal untuk dicetak', description: 'Ubah filter atau periode terlebih dahulu.', variant: 'destructive' });
      return;
    }
    setIsPrinting(true);
    try {
      const { data: serial, error: serialError } = await supabase.rpc('generate_report_serial');
      if (serialError || !serial) {
        console.error('Error generating serial:', serialError);
        toast({ title: 'Gagal menggenerate nomor seri laporan', variant: 'destructive' });
        return;
      }

      const rawToken = generateSecureToken();
      const tokenHash = await sha256Hex(rawToken);
      const verifyUrl = buildVerificationUrl(rawToken);

      const doc = await buildJournalPdf({ ...pdfOptions(), verifyUrl, serialNumber: serial as string });

      const totalHadir = filteredJournals.reduce((a, j) => a + j.students_present, 0);
      const totalTidak = filteredJournals.reduce((a, j) => a + j.students_absent, 0);
      const nowIso = new Date().toISOString();
      const reportData = {
        verification: 'DOKUMEN VALID',
        type: 'Rekap Jurnal Mengajar',
        school: (schoolSettings as any)?.school_name,
        period: periodLabel,
        summary: {
          totalJournals: filteredJournals.length,
          totalTeachers: new Set(filteredJournals.map((j) => j.teacher_id || j.teacher_name)).size,
          totalPresent: totalHadir,
          totalAbsent: totalTidak,
          presentPercent: totalHadir + totalTidak > 0 ? Math.round((totalHadir / (totalHadir + totalTidak)) * 1000) / 10 : 0,
        },
        filters: filterLines(),
        signer: signer?.name || null,
        journals: filteredJournals.map((j) => ({
          tanggal: j.date,
          guru: j.teacher_name,
          mapel: j.subject,
          kelas: shortClass(j.class_name),
          jam: jamLabel(j),
          materi: j.material,
          aktivitas: j.activity,
          hadir: j.students_present,
          tidakHadir: j.students_absent,
          catatan: j.notes,
        })),
        printDate: nowIso,
        print_date: nowIso,
        totalRecords: filteredJournals.length,
      };

      const { error: insertError } = await supabase.from('verified_reports').insert({
        serial_number: serial as string,
        report_type: 'journal',
        report_data: reportData,
        created_by: user?.id,
        token_hash: tokenHash,
        token_expires_at: null,
        revoked_at: null,
        access_count: 0,
      });
      if (insertError) {
        console.error('Error saving report:', insertError);
        toast({ title: 'Gagal menyimpan data laporan untuk verifikasi', variant: 'destructive' });
        return;
      }

      doc.save(`jurnal-mengajar-${startDate || 'awal'}-${endDate || 'akhir'}.pdf`);
      toast({ title: 'Laporan berhasil dicetak', description: 'QR verifikasi aman sudah disematkan.' });
    } catch (err) {
      console.error('Print error:', err);
      toast({ title: 'Gagal mencetak laporan', variant: 'destructive' });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredJournals.length === 0) {
      toast({ title: 'Tidak ada data untuk diekspor', variant: 'destructive' });
      return;
    }
    const header = ['Tanggal', 'Guru', 'Mapel', 'Kelas', 'Jam', 'Materi', 'Aktivitas Pembelajaran', 'Siswa Hadir', 'Siswa Tidak Hadir', 'Catatan'];
    const lines = [
      header.map(csvCell).join(','),
      ...filteredJournals.map((j) =>
        [j.date, j.teacher_name, j.subject, shortClass(j.class_name), jamLabel(j), j.material, j.activity, j.students_present, j.students_absent, j.notes]
          .map(csvCell).join(','),
      ),
    ];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jurnal-mengajar-${startDate || 'awal'}-${endDate || 'akhir'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Jurnal Mengajar</h1>
            <p className="text-muted-foreground">
              {userRole === 'admin' ? 'Pantau jurnal mengajar semua guru' : 'Kelola jurnal mengajar Anda'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={paper} onValueChange={(v) => changePaper(v as PaperSize)}>
              <SelectTrigger className="w-[84px] md:w-[110px]" title="Ukuran kertas cetak">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="f4">F4</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => handlePreview()} className="gap-2">
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Preview</span>
            </Button>
            <Button variant="outline" onClick={handleExportPDF} disabled={isPrinting} className="gap-2">
              {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              <span className="hidden sm:inline">Cetak</span>
            </Button>
            <Button variant="outline" onClick={handleExportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            {userRole === 'teacher' && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}>
                    <Plus className="mr-1 sm:mr-2 h-4 w-4" />
                    <span className="sm:hidden">Tambah</span>
                    <span className="hidden sm:inline">Tambah Jurnal</span>
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingJournal ? 'Edit Jurnal' : 'Tambah Jurnal Mengajar'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Jadwal</Label>
                      <Select value={formData.schedule_id} onValueChange={(value) => setFormData({ ...formData, schedule_id: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih jadwal" />
                        </SelectTrigger>
                        <SelectContent>
                          {schedules?.map((schedule) => (
                            <SelectItem key={schedule.id} value={schedule.id}>
                              {schedule.subject} - {schedule.classes?.name || ''} - {schedule.start_time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tanggal</Label>
                      <Input
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Materi Pembelajaran</Label>
                    <Textarea
                      value={formData.material}
                      onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                      placeholder="Jelaskan materi yang diajarkan..."
                      required
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Aktivitas Pembelajaran</Label>
                    <Input
                      value={formData.activity}
                      onChange={(e) => setFormData({ ...formData, activity: e.target.value })}
                      placeholder="Contoh: Diskusi kelompok, ceramah, praktikum"
                    />
                  </div>
                  <div className="space-y-4">
                    {/* Attendance Status Warning */}
                    {formData.schedule_id && formData.date && !editingJournal && (
                      <div className={`p-4 rounded-lg border ${
                        isCheckingAttendance 
                          ? 'bg-blue-50 border-blue-200' 
                          : hasAttendanceData === false 
                          ? 'bg-red-50 border-red-200' 
                          : hasAttendanceData === true
                          ? 'bg-green-50 border-green-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        {isCheckingAttendance ? (
                          <div className="flex items-center gap-2 text-blue-700">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700" />
                            <p className="text-sm font-medium">Memeriksa data absensi...</p>
                          </div>
                        ) : hasAttendanceData === false ? (
                          <div>
                            <div className="text-red-700 mb-3">
                              <p className="text-sm font-semibold mb-1">⚠️ Belum ada data absensi untuk jadwal ini</p>
                              <p className="text-xs">
                                {previousAttendance
                                  ? `Kelas ini sudah diabsen pada mapel ${previousAttendance.label}: hadir ${previousAttendance.present}, tidak hadir ${previousAttendance.absent}. Pakai absensi tersebut atau buat absen baru.`
                                  : 'Silakan isi absensi untuk jadwal dan tanggal ini terlebih dahulu sebelum membuat jurnal mengajar.'}
                              </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                              {previousAttendance && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="gap-2"
                                  onClick={usePreviousAttendance}
                                >
                                  Gunakan absensi mapel sebelumnya
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-2 border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                                onClick={createNewAttendance}
                              >
                                Buat absen baru
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : hasAttendanceData === true ? (
                          <div className="text-green-700">
                            <p className="text-sm font-semibold mb-1">✓ Data absensi tersedia</p>
                            <p className="text-xs">
                              {usingPrevious && previousAttendance
                                ? `Jumlah kehadiran diambil dari absensi mapel ${previousAttendance.label}.`
                                : 'Jumlah kehadiran telah terisi otomatis dari data absensi.'}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Jumlah Siswa Hadir</Label>
                        <Input
                          type="number"
                          value={formData.students_present}
                          onChange={(e) => setFormData({ ...formData, students_present: parseInt(e.target.value) || 0 })}
                          min="0"
                          disabled
                          className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground">Otomatis dari data absensi</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Jumlah Siswa Tidak Hadir</Label>
                        <Input
                          type="number"
                          value={formData.students_absent}
                          onChange={(e) => setFormData({ ...formData, students_absent: parseInt(e.target.value) || 0 })}
                          min="0"
                          disabled
                          className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground">Otomatis dari data absensi</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Catatan Tambahan</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Catatan atau kendala pembelajaran..."
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={!editingJournal && (hasAttendanceData === false || isCheckingAttendance)}
                    >
                      {editingJournal ? 'Simpan' : 'Tambah'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Filter & Daftar Jurnal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Periode</Label>
                <Select value={periodPreset} onValueChange={applyPreset}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hari ini</SelectItem>
                    <SelectItem value="7d">7 hari terakhir</SelectItem>
                    <SelectItem value="month">Bulan ini</SelectItem>
                    <SelectItem value="last_month">Bulan lalu</SelectItem>
                    <SelectItem value="year">Tahun ini</SelectItem>
                    <SelectItem value="custom">Pilih tanggal sendiri</SelectItem>
                    <SelectItem value="all">Semua periode</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dari Tanggal</Label>
                <Input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => { setStartDate(e.target.value); setPeriodPreset('custom'); }}
                />
              </div>
              <div className="space-y-2">
                <Label>Sampai Tanggal</Label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => { setEndDate(e.target.value); setPeriodPreset('custom'); }}
                />
              </div>
              <div className="space-y-2">
                <Label>Filter Jadwal</Label>
                <Select value={filterSchedule} onValueChange={setFilterSchedule}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua jadwal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Jadwal</SelectItem>
                    {schedules?.map((schedule) => (
                      <SelectItem key={schedule.id} value={schedule.id}>
                        {schedule.subject} - {shortClass((schedule as any).classes?.name)} - {shortTime(schedule.start_time)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {userRole === 'admin' && (
                <div className="space-y-2">
                  <Label>Guru</Label>
                  <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                    <SelectTrigger>
                      <SelectValue placeholder="Semua guru" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Guru</SelectItem>
                      {[...(teacherList || [])]
                        .sort((a, b) => a.name.localeCompare(b.name, 'id'))
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className={`space-y-2 ${userRole === 'admin' ? 'md:col-span-2' : 'md:col-span-3'}`}>
                <Label>Cari (materi, aktivitas, catatan)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Ketik kata kunci..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Urutkan</Label>
                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Tanggal</SelectItem>
                      {userRole === 'admin' && <SelectItem value="teacher">Guru</SelectItem>}
                      <SelectItem value="schedule">Mapel / Kelas</SelectItem>
                      <SelectItem value="present">Siswa hadir</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={sortOrder === 'asc' ? 'Naik (A-Z / terlama)' : 'Turun (Z-A / terbaru)'}
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {invalidRange && (
              <p className="text-sm text-destructive">Tanggal mulai tidak boleh setelah tanggal akhir.</p>
            )}
            {isJournalsError && (
              <p className="text-sm text-destructive">Gagal memuat data jurnal. Coba muat ulang halaman.</p>
            )}

            <p className="text-sm text-muted-foreground">
              {isLoadingJournals ? 'Memuat jurnal...' : `${filteredJournals.length} jurnal · ${periodLabel}`}
            </p>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    {userRole === 'admin' && (
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => toggleSort('teacher')} className="gap-1 -ml-3">
                          Guru <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                    )}
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort('date')} className="gap-1 -ml-3">
                        Tanggal <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort('schedule')} className="gap-1 -ml-3">
                        Jadwal <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead>Materi</TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort('present')} className="gap-1 -ml-3">
                        Kehadiran <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    {userRole === 'teacher' && <TableHead>Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedJournals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={userRole === 'admin' ? 6 : 6} className="text-center text-muted-foreground py-8">
                        {isLoadingJournals ? 'Memuat...' : 'Tidak ada jurnal pada periode / filter ini'}
                      </TableCell>
                    </TableRow>
                  )}
                  {pagedJournals.map((journal, index) => (
                    <TableRow key={journal.id}>
                      <TableCell>{(safePage - 1) * pageSize + index + 1}</TableCell>
                      {userRole === 'admin' && (
                        <TableCell className="font-medium">{journal.teacher_name}</TableCell>
                      )}
                      <TableCell className="whitespace-nowrap">{formatTanggalID(journal.date)}</TableCell>
                      <TableCell>{getScheduleInfo(journal)}</TableCell>
                      <TableCell className="max-w-xs truncate" title={journal.material}>{journal.material}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        Hadir: {journal.students_present}, Tidak: {journal.students_absent}
                      </TableCell>
                      {userRole === 'teacher' && (
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(journal)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DataPagination
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={filteredJournals.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) closePreview(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-3 sm:p-6 flex flex-col">
          <DialogHeader>
            <DialogTitle>Pratinjau Laporan Jurnal Mengajar</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-md border bg-muted overflow-hidden">
            {previewLoading || !previewUrl ? (
              <div className="h-full flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Menyusun pratinjau...
              </div>
            ) : (
              <iframe title="Pratinjau jurnal" src={previewUrl} className="w-full h-full" />
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Pratinjau mengikuti filter & periode saat ini. QR verifikasi (pojok kiri bawah) dibuat saat dicetak.
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Select value={paper} onValueChange={(v) => changePaper(v as PaperSize)}>
                <SelectTrigger className="w-[84px] sm:w-[110px]" title="Ukuran kertas">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4</SelectItem>
                  <SelectItem value="f4">F4</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={closePreview}>Tutup</Button>
              <Button onClick={handleExportPDF} disabled={isPrinting || filteredJournals.length === 0} className="gap-2">
                {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Cetak PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Journals;
