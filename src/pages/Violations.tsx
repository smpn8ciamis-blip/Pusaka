import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Pencil, Trash2, AlertTriangle, ArrowUpDown, Search, FileDown,
  Check, ChevronsUpDown, CalendarDays, X, Filter,
} from 'lucide-react';
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
} from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { ImportViolationTypes } from '@/components/ImportViolationTypes';
import { StudentSearchSelect } from '@/components/StudentSearchSelect';
import { HighlightText } from '@/components/HighlightText';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  generateSecureToken,
  sha256Hex,
  buildVerificationUrl,
  addVerificationQR,
} from '@/lib/reportVerification';

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
 * Kop surat rapat (ala kwitansi) + logo kiri-kanan.
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
      doc.addImage(logoRight, 'PNG', pageWidth - cfg.logoX - cfg.logoSize, cfg.logoY, cfg.logoSize, cfg.logoSize, undefined, 'FAST');
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

/* ============================================================
   Palet warna kategori pelanggaran di PDF
   ============================================================ */
const VIOLATION_PALETTE: Record<
  string,
  { bg: [number, number, number]; fg: [number, number, number] }
> = {
  ringan: { bg: [255, 251, 235], fg: [146, 64, 14] },
  sedang: { bg: [255, 237, 213], fg: [154, 52, 18] },
  berat:  { bg: [255, 228, 230], fg: [159, 18, 57] },
};

// ============================================================
// Searchable Select untuk Jenis Pelanggaran
// ============================================================
interface ViolationTypeSearchSelectProps {
  types: any[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
}

function ViolationTypeSearchSelect({
  types,
  value,
  onChange,
  label = 'Jenis Pelanggaran',
  required = false,
  placeholder = 'Pilih jenis pelanggaran...',
}: ViolationTypeSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const activeTypes = useMemo(() => types.filter((t) => t.is_active), [types]);
  const selected = useMemo(() => activeTypes.find((t) => t.id === value), [activeTypes, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeTypes;
    return activeTypes.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const category = (t.category || '').toLowerCase();
      const points = String(t.points ?? '');
      return name.includes(q) || category.includes(q) || points.includes(q);
    });
  }, [activeTypes, search]);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const t of filtered) {
      const cat = t.category || 'lainnya';
      if (!map[cat]) map[cat] = [];
      map[cat].push(t);
    }
    return map;
  }, [filtered]);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ringan': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'sedang': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'berat': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  return (
    <div>
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span className="flex items-center gap-2 truncate">
                <span className="truncate">{selected.name}</span>
                <Badge variant="outline" className={cn('shrink-0 text-xs', getCategoryColor(selected.category))}>
                  {selected.category}
                </Badge>
                <span className="shrink-0 text-xs text-muted-foreground">{selected.points} poin</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Cari jenis pelanggaran (nama / kategori / poin)..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {filtered.length === 0 ? (
                <CommandEmpty>Tidak ada jenis pelanggaran yang cocok.</CommandEmpty>
              ) : (
                Object.entries(grouped).map(([category, items]) => (
                  <CommandGroup key={category} heading={<span className="capitalize">{category}</span>}>
                    {items.map((type) => (
                      <CommandItem
                        key={type.id}
                        value={type.id}
                        onSelect={() => {
                          onChange(type.id);
                          setOpen(false);
                          setSearch('');
                        }}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Check className={cn('h-4 w-4 shrink-0', value === type.id ? 'opacity-100' : 'opacity-0')} />
                          <span className="truncate">{type.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={cn('text-xs', getCategoryColor(type.category))}>
                            {type.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{type.points} poin</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <input type="hidden" name="violation_type_id" value={value} required={required} />
    </div>
  );
}

// ============================================================
// Tipe preset rentang waktu
// ============================================================
type DatePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

export default function Violations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViolationDialogOpen, setIsViolationDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedViolationTypeId, setSelectedViolationTypeId] = useState('');
  const [violationSearch, setViolationSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<'date' | 'student' | 'class' | 'points'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const itemsPerPage = 30;

  // State filter waktu
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const computeRange = (preset: DatePreset) => {
    const now = new Date();
    switch (preset) {
      case 'today':
        return {
          from: format(startOfDay(now), 'yyyy-MM-dd'),
          to: format(endOfDay(now), 'yyyy-MM-dd'),
        };
      case 'week':
        return {
          from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          to: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        };
      case 'month':
        return {
          from: format(startOfMonth(now), 'yyyy-MM-dd'),
          to: format(endOfMonth(now), 'yyyy-MM-dd'),
        };
      default:
        return { from: '', to: '' };
    }
  };

  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset);
    setCurrentPage(1);
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset === 'custom') {
      // biarkan user mengisi
    } else {
      const { from, to } = computeRange(preset);
      setDateFrom(from);
      setDateTo(to);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, violationSearch]);

  const isDateFilterActive = !!(dateFrom || dateTo);

  const clearDateFilter = () => {
    setDatePreset('all');
    setDateFrom('');
    setDateTo('');
  };

  const dateFilterLabel = useMemo(() => {
    if (!isDateFilterActive) return 'Semua Waktu';
    if (datePreset === 'today') return 'Hari Ini';
    if (datePreset === 'week') return 'Minggu Ini';
    if (datePreset === 'month') return 'Bulan Ini';
    if (dateFrom && dateTo)
      return `${format(new Date(dateFrom), 'dd MMM yyyy', { locale: idLocale })} — ${format(new Date(dateTo), 'dd MMM yyyy', { locale: idLocale })}`;
    if (dateFrom)
      return `Sejak ${format(new Date(dateFrom), 'dd MMM yyyy', { locale: idLocale })}`;
    return `Sampai ${format(new Date(dateTo), 'dd MMM yyyy', { locale: idLocale })}`;
  }, [datePreset, dateFrom, dateTo, isDateFilterActive]);

  // Roles
  const { data: userRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      if (error) return [];
      return data?.map((r: any) => r.role) || [];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const isAdmin = userRoles.includes('admin');
  const isKesiswaan = userRoles.includes('kesiswaan');
  const isOsis = userRoles.includes('osis');
  const isGuruPiket = userRoles.includes('guru_piket');
  const isTeacher = userRoles.includes('teacher');

  const canAccessPage = isAdmin || isKesiswaan || isOsis || isGuruPiket || isTeacher;
  const canCreateViolation = isAdmin || isKesiswaan || isOsis || isGuruPiket || isTeacher;
  const canManageTypes = isAdmin || isKesiswaan;
  const canDeleteViolation = isAdmin || isKesiswaan;

  // Fetch violation types
  const { data: violationTypes = [], isLoading: typesLoading } = useQuery({
    queryKey: ['violation-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('violation_types')
        .select('*')
        .order('category', { ascending: true })
        .order('points', { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // ============================================================
  // ⭐ Fetch students — HANYA siswa aktif (bukan alumni)
  // Dipakai untuk dropdown pencarian siswa di form Catat Pelanggaran
  // ============================================================
  const { data: students = [] } = useQuery({
    queryKey: ['students', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*, classes(name)')
        .eq('status', 'aktif')
        .eq('is_alumni', false)
        .order('full_name');
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Fetch total count dengan filter tanggal
  const { data: totalViolationsCount } = useQuery({
    queryKey: ['student-violations-count', dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('student_violations')
        .select('*', { count: 'exact', head: true });

      if (dateFrom) query = query.gte('violation_date', dateFrom);
      if (dateTo) query = query.lte('violation_date', dateTo);

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    staleTime: 1 * 60 * 1000,
  });

  // Fetch violations dengan filter tanggal + pagination
  const { data: violations = [], isLoading: violationsLoading } = useQuery({
    queryKey: ['student-violations', currentPage, dateFrom, dateTo],
    queryFn: async () => {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('student_violations')
        .select(`
          *,
          students(full_name, nis, classes(name)),
          violation_types(name, category)
        `)
        .order('violation_date', { ascending: false });

      if (dateFrom) query = query.gte('violation_date', dateFrom);
      if (dateTo) query = query.lte('violation_date', dateTo);

      const { data, error } = await query.range(from, to);
      if (error) throw error;

      if (data && data.length > 0) {
        const reporterIds = [...new Set(data.map(v => v.reported_by).filter(Boolean))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', reporterIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        return data.map(v => ({ ...v, reporter: profileMap.get(v.reported_by) }));
      }
      return data || [];
    },
    staleTime: 1 * 60 * 1000,
    enabled: canAccessPage,
  });

  // Fetch ALL violations untuk rekap & leaderboard (dengan filter tanggal)
  const { data: allViolationsForSummary = [] } = useQuery({
    queryKey: ['student-violations-summary', dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('student_violations')
        .select(`
          student_id, points, violation_date,
          students(full_name, nis, classes(name))
        `);

      if (dateFrom) query = query.gte('violation_date', dateFrom);
      if (dateTo) query = query.lte('violation_date', dateTo);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 1 * 60 * 1000,
    enabled: canAccessPage,
  });

  const studentPoints = allViolationsForSummary.reduce((acc: any, v: any) => {
    const studentId = v.student_id;
    if (!acc[studentId]) {
      acc[studentId] = {
        student: v.students,
        totalPoints: 0,
        violations: [],
      };
    }
    acc[studentId].totalPoints += v.points;
    acc[studentId].violations.push(v);
    return acc;
  }, {});

  const leaderboard = Object.values(studentPoints)
    .sort((a: any, b: any) => b.totalPoints - a.totalPoints)
    .slice(0, 10);

  const sortedStudentPoints = Object.values(studentPoints).sort(
    (a: any, b: any) => b.totalPoints - a.totalPoints
  );

  const totalViolationsPages = Math.ceil((totalViolationsCount || 0) / itemsPerPage);

  const filteredAndSortedViolations = useMemo(() => {
    if (!violations) return [];

    let filtered = violations;
    if (violationSearch.trim()) {
      const search = violationSearch.toLowerCase();
      filtered = violations.filter(v =>
        v.students?.full_name?.toLowerCase().includes(search) ||
        v.students?.nis?.toLowerCase().includes(search) ||
        v.students?.classes?.name?.toLowerCase().includes(search) ||
        v.violation_types?.name?.toLowerCase().includes(search)
      );
    }

    return [...filtered].sort((a, b) => {
      let compareA: any;
      let compareB: any;

      switch (sortField) {
        case 'date':
          compareA = new Date(a.violation_date).getTime();
          compareB = new Date(b.violation_date).getTime();
          break;
        case 'student':
          compareA = a.students?.full_name || '';
          compareB = b.students?.full_name || '';
          break;
        case 'class':
          compareA = a.students?.classes?.name || '';
          compareB = b.students?.classes?.name || '';
          break;
        case 'points':
          compareA = a.points || 0;
          compareB = b.points || 0;
          break;
        default:
          return 0;
      }

      if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [violations, sortField, sortOrder, violationSearch]);

  const handleSort = (field: 'date' | 'student' | 'class' | 'points') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'date' || field === 'points' ? 'desc' : 'asc');
    }
  };

  // MUTATIONS
  const createTypeMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('violation_types').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['violation-types'] });
      toast({ title: 'Jenis pelanggaran berhasil ditambahkan' });
      setIsDialogOpen(false);
      setEditingType(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = await supabase.from('violation_types').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['violation-types'] });
      toast({ title: 'Jenis pelanggaran berhasil diperbarui' });
      setIsDialogOpen(false);
      setEditingType(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('violation_types').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['violation-types'] });
      toast({ title: 'Jenis pelanggaran berhasil dinonaktifkan' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteViolationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('student_violations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-violations'] });
      queryClient.invalidateQueries({ queryKey: ['student-violations-count'] });
      queryClient.invalidateQueries({ queryKey: ['student-violations-summary'] });
      toast({ title: 'Pelanggaran berhasil dihapus' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createViolationMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('student_violations').insert([{
        ...data,
        reported_by: user?.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-violations'] });
      queryClient.invalidateQueries({ queryKey: ['student-violations-count'] });
      queryClient.invalidateQueries({ queryKey: ['student-violations-summary'] });
      toast({ title: 'Pelanggaran berhasil dicatat' });
      setIsViolationDialogOpen(false);
      setSelectedStudentId('');
      setSelectedViolationTypeId('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // HANDLERS
  const handleTypeSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      points: parseInt(formData.get('points') as string),
      category: formData.get('category') as string,
    };

    if (editingType) {
      updateTypeMutation.mutate({ id: editingType.id, ...data });
    } else {
      createTypeMutation.mutate(data);
    }
  };

  const handleViolationSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const violationTypeId = selectedViolationTypeId || (formData.get('violation_type_id') as string);
    const violationType = violationTypes.find(v => v.id === violationTypeId);

    if (!selectedStudentId) {
      toast({ title: 'Error', description: 'Pilih siswa terlebih dahulu', variant: 'destructive' });
      return;
    }
    if (!violationTypeId) {
      toast({ title: 'Error', description: 'Pilih jenis pelanggaran terlebih dahulu', variant: 'destructive' });
      return;
    }

    const data = {
      student_id: selectedStudentId,
      violation_type_id: violationTypeId,
      points: violationType?.points || 0,
      violation_date: formData.get('violation_date') as string,
      notes: formData.get('notes') as string,
    };

    createViolationMutation.mutate(data);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ringan': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'sedang': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'berat': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getPointsColor = (points: number) => {
    if (points < 50) return 'text-green-600 dark:text-green-400';
    if (points < 100) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Ambil school settings
  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // ============================================================
  // ⭐ EXPORT PDF PELANGGARAN — format sama dengan handlePrintAbsent
  // ============================================================
  const exportViolationsPDF = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Ambil SEMUA data sesuai filter (bukan hanya halaman aktif)
      let query = supabase
        .from('student_violations')
        .select(`
          *,
          students(full_name, nis, classes(name)),
          violation_types(name, category)
        `)
        .order('violation_date', { ascending: false });

      if (dateFrom) query = query.gte('violation_date', dateFrom);
      if (dateTo) query = query.lte('violation_date', dateTo);

      const { data: allData, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      let exportData: any[] = allData || [];
      if (exportData.length > 0) {
        const reporterIds = [...new Set(exportData.map(v => v.reported_by).filter(Boolean))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', reporterIds);
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        exportData = exportData.map(v => ({ ...v, reporter: profileMap.get(v.reported_by) }));
      }

      // Terapkan search box (jika ada)
      if (violationSearch.trim()) {
        const s = violationSearch.toLowerCase();
        exportData = exportData.filter(v =>
          v.students?.full_name?.toLowerCase().includes(s) ||
          v.students?.nis?.toLowerCase().includes(s) ||
          v.students?.classes?.name?.toLowerCase().includes(s) ||
          v.violation_types?.name?.toLowerCase().includes(s)
        );
      }

      // ==== LETTERHEAD RAPAT ====
      const startY = await drawCompactLetterhead(doc, schoolSettings);

      // ==== JUDUL ====
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('LAPORAN DATA PELANGGARAN SISWA', pageWidth / 2, startY + 2, { align: 'center' });

      // ==== INFO PERIODE ====
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const infoY = startY + 12;
      const periodeText = isDateFilterActive
        ? `Periode: ${dateFrom ? format(new Date(dateFrom), 'dd MMMM yyyy', { locale: idLocale }) : '-'} s/d ${dateTo ? format(new Date(dateTo), 'dd MMMM yyyy', { locale: idLocale }) : '-'}`
        : 'Periode: Semua Waktu';
      doc.text(periodeText, 14, infoY);
      doc.text(
        `Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`,
        pageWidth - 14, infoY, { align: 'right' },
      );

      // ==== SUMMARY BOX ====
      const summaryY = infoY + 8;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.setFillColor(250, 250, 252);
      doc.roundedRect(14, summaryY, pageWidth - 28, 12, 2, 2, 'FD');
      doc.setLineWidth(0.1);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const totalViolations = exportData.length;
      const totalPoints = exportData.reduce((sum, v) => sum + (v.points || 0), 0);
      const countRingan = exportData.filter(v => v.violation_types?.category === 'ringan').length;
      const countSedang = exportData.filter(v => v.violation_types?.category === 'sedang').length;
      const countBerat = exportData.filter(v => v.violation_types?.category === 'berat').length;

      const boxCenterY = summaryY + 7;
      let summaryX = 20;

      doc.setTextColor(0, 0, 0);
      const totalText = `Total: ${totalViolations} pelanggaran (${totalPoints} poin)`;
      doc.text(totalText, summaryX, boxCenterY);
      summaryX += doc.getTextWidth(totalText) + 12;

      doc.setTextColor(146, 64, 14);
      const ringanText = `Ringan: ${countRingan}`;
      doc.text(ringanText, summaryX, boxCenterY);
      summaryX += doc.getTextWidth(ringanText) + 12;

      doc.setTextColor(154, 52, 18);
      const sedangText = `Sedang: ${countSedang}`;
      doc.text(sedangText, summaryX, boxCenterY);
      summaryX += doc.getTextWidth(sedangText) + 12;

      doc.setTextColor(159, 18, 57);
      doc.text(`Berat: ${countBerat}`, summaryX, boxCenterY);
      doc.setTextColor(0, 0, 0);

      // ==== DATA TABEL ====
      const tableData = exportData.map((v: any, index: number) => [
        index + 1,
        format(new Date(v.violation_date), 'dd/MM/yyyy'),
        v.students?.full_name || '-',
        v.students?.nis || '-',
        v.students?.classes?.name || '-',
        v.violation_types?.name || '-',
        v.violation_types?.category || '-',
        v.points,
        v.reporter?.full_name || '-',
        v.notes || '-',
      ]);

      // ==== TABEL dengan lebar kolom yang disesuaikan ====
      autoTable(doc, {
        startY: summaryY + 18,
        head: [['No', 'Tanggal', 'Nama Siswa', 'NIS', 'Kelas', 'Jenis Pelanggaran', 'Kategori', 'Poin', 'Pelapor', 'Catatan']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [220, 38, 38],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 8,
          lineColor: [0, 0, 0],
          lineWidth: 0.3,
        },
        bodyStyles: {
          lineColor: [0, 0, 0],
          lineWidth: 0.15,
          fontSize: 7,
          cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
          valign: 'middle',
          textColor: [17, 24, 39],
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          1: { halign: 'center', cellWidth: 20 },
          2: { cellWidth: 28, overflow: 'linebreak' },
          3: { halign: 'center', cellWidth: 16 },
          4: { halign: 'center', cellWidth: 14 },
          5: { cellWidth: 32, overflow: 'linebreak' },
          6: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
          7: { halign: 'center', cellWidth: 12 },
          8: { cellWidth: 16, overflow: 'linebreak' },
          9: { cellWidth: 20, overflow: 'linebreak' },
        },
        alternateRowStyles: { fillColor: [255, 255, 255] },
        margin: { left: 10, right: 10 },
        didParseCell: (data) => {
          const isLastRow = data.section === 'body' && data.row.index === tableData.length - 1;
          const isFirstHeadRow = data.section === 'head';

          if (isFirstHeadRow) {
            data.cell.styles.lineWidth = {
              top: 0.4, bottom: 0.4,
              left: data.column.index === 0 ? 0.4 : 0.3,
              right: data.column.index === 9 ? 0.4 : 0.3,
            };
          } else if (data.section === 'body') {
            data.cell.styles.lineWidth = {
              top: 0.15,
              bottom: isLastRow ? 0.4 : 0.15,
              left: data.column.index === 0 ? 0.4 : 0.15,
              right: data.column.index === 9 ? 0.4 : 0.15,
            };
          }

          // Warna kolom kategori
          if (data.section === 'body' && data.column.index === 6) {
            const category = String(data.cell.raw || '').toLowerCase();
            const p = VIOLATION_PALETTE[category];
            if (p) {
              data.cell.styles.fillColor = p.bg;
              data.cell.styles.textColor = p.fg;
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.halign = 'center';
              data.cell.styles.lineColor = [0, 0, 0];
            }
          }

          // Warna kolom poin
          if (data.section === 'body' && data.column.index === 7) {
            const points = Number(data.cell.raw || 0);
            if (points >= 100) {
              data.cell.styles.textColor = [159, 18, 57];
              data.cell.styles.fontStyle = 'bold';
            } else if (points >= 50) {
              data.cell.styles.textColor = [154, 52, 18];
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = [22, 101, 52];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
      });

      const finalY = (doc as any).lastAutoTable.finalY;

      // ==== SIMPAN LAPORAN ====
      const reportData = {
        type: 'violations',
        school: schoolSettings?.school_name,
        period: periodeText,
        summary: {
          totalViolations,
          totalPoints,
          ringan: countRingan,
          sedang: countSedang,
          berat: countBerat,
        },
        violations: exportData.map((v) => ({
          nis: v.students?.nis,
          nama: v.students?.full_name,
          kelas: v.students?.classes?.name,
          jenis: v.violation_types?.name,
          kategori: v.violation_types?.category,
          poin: v.points,
          tanggal: v.violation_date,
          pelapor: v.reporter?.full_name,
          catatan: v.notes,
        })),
        printDate: new Date().toISOString(),
        totalRecords: exportData.length,
      };

      const rawToken = generateSecureToken();
      const tokenHash = await sha256Hex(rawToken);

      const { data: serialData, error: serialError } = await supabase.rpc('generate_report_serial');
      if (serialError) {
        console.error('Error generating serial:', serialError);
        toast({ title: 'Gagal menggenerate nomor seri laporan', variant: 'destructive' });
        return;
      }

      const { error: insertError } = await supabase.from('verified_reports').insert({
        serial_number: serialData,
        report_type: 'violations',
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

      // ==== QR VERIFIKASI dengan BORDER BOX ====
      const qrSize = 32;
      const qrPad = 5;
      const qrTextSpace = 6;
      const boxWidth = qrSize + qrPad * 2;
      const boxHeight = qrSize + qrPad * 2 + qrTextSpace;

      const qrX = pageWidth - boxWidth - 14;
      let qrY = finalY + 10;

      if (qrY + boxHeight + 6 > pageHeight - 10) {
        doc.addPage();
        qrY = 20;
      }

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(qrX, qrY, boxWidth, boxHeight, 2, 2, 'FD');
      doc.setLineWidth(0.1);

      const verifyUrl = buildVerificationUrl(rawToken);
      await addVerificationQR(doc, verifyUrl, qrX + qrPad, qrY + qrPad, qrSize);

      // Keterangan di kiri QR
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 101, 52);
      doc.text('DOKUMEN TERVERIFIKASI', 14, qrY + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      doc.text('Scan QR Code di samping untuk memverifikasi', 14, qrY + 9);
      doc.text('keaslian dokumen dan melihat data pelanggaran', 14, qrY + 13);
      doc.text('siswa secara real-time.', 14, qrY + 17);

      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('Dokumen berlaku selama arsip sekolah aktif.', 14, qrY + 23);
      doc.text(`No. Seri: ${serialData}`, 14, qrY + 28);
      doc.setTextColor(0, 0, 0);

      // ==== FOOTER NOMOR HALAMAN ====
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 120, 120);
        doc.text(
          `Halaman ${i} dari ${pageCount}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
        doc.setTextColor(0, 0, 0);
      }

      doc.save(`Laporan-Pelanggaran-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF berhasil diunduh dengan QR verifikasi' });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({ title: 'Error', description: 'Gagal membuat PDF', variant: 'destructive' });
    }
  };

  // GUARD
  if (rolesLoading) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="flex items-center justify-center py-20">
            <span className="text-muted-foreground">Memeriksa akses...</span>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  if (!canAccessPage) {
    return (
      <ProtectedRoute>
        <DashboardLayout>
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-bold">Akses Ditolak</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Anda tidak memiliki izin untuk mengakses halaman Poin Pelanggaran.
            </p>
          </div>
        </DashboardLayout>
      </ProtectedRoute>
    );
  }

  // RENDER
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Poin Pelanggaran Siswa</h1>
              <p className="text-muted-foreground mt-2">
                {isOsis && !isAdmin && !isKesiswaan
                  ? 'Catat pelanggaran siswa dan lihat rekap'
                  : 'Kelola jenis pelanggaran dan catat pelanggaran siswa'}
              </p>
            </div>
            {isOsis && !isAdmin && !isKesiswaan && (
              <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800">
                Mode OSIS — Akses Terbatas
              </Badge>
            )}
          </div>

          <Tabs defaultValue="violations" className="w-full">
            <TabsList className={canManageTypes ? "grid w-full grid-cols-4" : "grid w-full grid-cols-3"}>
              <TabsTrigger value="violations">Daftar Pelanggaran</TabsTrigger>
              <TabsTrigger value="summary">Rekap Per Siswa</TabsTrigger>
              <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              {canManageTypes && (
                <TabsTrigger value="types">Jenis Pelanggaran</TabsTrigger>
              )}
            </TabsList>

            {/* ======================= TAB: VIOLATIONS ======================= */}
            <TabsContent value="violations" className="space-y-4">
              <div className="flex flex-col lg:flex-row gap-3 justify-between">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama siswa, NIS, kelas, atau jenis pelanggaran..."
                    value={violationSearch}
                    onChange={(e) => setViolationSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={exportViolationsPDF}>
                    <FileDown className="h-4 w-4 mr-2" />
                    Cetak PDF
                  </Button>

                  {canCreateViolation && (
                    <Dialog
                      open={isViolationDialogOpen}
                      onOpenChange={(open) => {
                        setIsViolationDialogOpen(open);
                        if (!open) {
                          setSelectedViolationTypeId('');
                          setSelectedStudentId('');
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Catat Pelanggaran
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Catat Pelanggaran Siswa</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleViolationSubmit} className="space-y-4">
                          {/* ⭐ Dropdown siswa — hanya menampilkan siswa AKTIF */}
                          <StudentSearchSelect
                            students={students}
                            value={selectedStudentId}
                            onChange={setSelectedStudentId}
                            label="Siswa"
                            required
                          />

                          <ViolationTypeSearchSelect
                            types={violationTypes}
                            value={selectedViolationTypeId}
                            onChange={setSelectedViolationTypeId}
                            label="Jenis Pelanggaran"
                            required
                          />

                          <div>
                            <Label>Tanggal</Label>
                            <Input
                              type="date"
                              name="violation_date"
                              defaultValue={format(new Date(), 'yyyy-MM-dd')}
                              required
                            />
                          </div>

                          <div>
                            <Label>Catatan</Label>
                            <Textarea name="notes" placeholder="Catatan tambahan (opsional)" />
                          </div>

                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setIsViolationDialogOpen(false)}
                            >
                              Batal
                            </Button>
                            <Button type="submit" disabled={createViolationMutation.isPending}>
                              {createViolationMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              {/* Filter Waktu */}
              <Card>
                <CardContent className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mr-2">
                      <Filter className="h-4 w-4" />
                      <span>Filter Waktu:</span>
                    </div>

                    <Button
                      size="sm"
                      variant={datePreset === 'all' ? 'default' : 'outline'}
                      onClick={() => applyPreset('all')}
                    >
                      Semua
                    </Button>
                    <Button
                      size="sm"
                      variant={datePreset === 'today' ? 'default' : 'outline'}
                      onClick={() => applyPreset('today')}
                    >
                      Hari Ini
                    </Button>
                    <Button
                      size="sm"
                      variant={datePreset === 'week' ? 'default' : 'outline'}
                      onClick={() => applyPreset('week')}
                    >
                      Minggu Ini
                    </Button>
                    <Button
                      size="sm"
                      variant={datePreset === 'month' ? 'default' : 'outline'}
                      onClick={() => applyPreset('month')}
                    >
                      Bulan Ini
                    </Button>

                    <div className="h-6 w-px bg-border mx-1" />

                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                          setDateFrom(e.target.value);
                          setDatePreset('custom');
                        }}
                        className="h-9 w-[150px]"
                        placeholder="Dari"
                      />
                      <span className="text-muted-foreground text-sm">s/d</span>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                          setDateTo(e.target.value);
                          setDatePreset('custom');
                        }}
                        className="h-9 w-[150px]"
                        placeholder="Sampai"
                      />
                    </div>

                    {isDateFilterActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearDateFilter}
                        className="text-muted-foreground"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reset
                      </Button>
                    )}

                    <Badge variant="secondary" className="ml-auto">
                      {dateFilterLabel}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Data Pelanggaran</span>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Halaman {currentPage} dari {totalViolationsPages || 1}</span>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    Menampilkan {filteredAndSortedViolations.length} dari {totalViolationsCount} total pelanggaran
                    {isDateFilterActive && ` (${dateFilterLabel})`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">No</TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('date')}>
                            <div className="flex items-center gap-1">
                              Tanggal
                              <ArrowUpDown className="h-4 w-4" />
                            </div>
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('student')}>
                            <div className="flex items-center gap-1">
                              Siswa
                              <ArrowUpDown className="h-4 w-4" />
                            </div>
                          </TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('class')}>
                            <div className="flex items-center gap-1">
                              Kelas
                              <ArrowUpDown className="h-4 w-4" />
                            </div>
                          </TableHead>
                          <TableHead>Jenis Pelanggaran</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead className="cursor-pointer" onClick={() => handleSort('points')}>
                            <div className="flex items-center gap-1">
                              Poin
                              <ArrowUpDown className="h-4 w-4" />
                            </div>
                          </TableHead>
                          <TableHead>Pelapor</TableHead>
                          <TableHead>Catatan</TableHead>
                          {canDeleteViolation && <TableHead className="text-right">Aksi</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {violationsLoading ? (
                          <TableRow>
                            <TableCell colSpan={canDeleteViolation ? 10 : 9} className="text-center py-8">
                              Loading...
                            </TableCell>
                          </TableRow>
                        ) : filteredAndSortedViolations.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={canDeleteViolation ? 10 : 9} className="text-center py-8">
                              <div className="flex flex-col items-center gap-2">
                                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                                <p className="text-muted-foreground">
                                  Tidak ada data pelanggaran{isDateFilterActive ? ' pada periode ini' : ''}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredAndSortedViolations.map((violation: any, index: number) => (
                            <TableRow key={violation.id}>
                              <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                              <TableCell>
                                {format(new Date(violation.violation_date), 'dd MMM yyyy', { locale: idLocale })}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <HighlightText text={violation.students?.full_name || '-'} searchTerm={violationSearch} />
                                  <span className="text-xs text-muted-foreground">
                                    <HighlightText text={violation.students?.nis || '-'} searchTerm={violationSearch} />
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <HighlightText text={violation.students?.classes?.name || '-'} searchTerm={violationSearch} />
                              </TableCell>
                              <TableCell>
                                <HighlightText text={violation.violation_types?.name || '-'} searchTerm={violationSearch} />
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={getCategoryColor(violation.violation_types?.category)}>
                                  {violation.violation_types?.category}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className={`font-semibold ${getPointsColor(violation.points)}`}>
                                  {violation.points}
                                </span>
                              </TableCell>
                              <TableCell>{violation.reporter?.full_name || '-'}</TableCell>
                              <TableCell className="max-w-xs truncate">{violation.notes || '-'}</TableCell>
                              {canDeleteViolation && (
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteViolationMutation.mutate(violation.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {totalViolationsPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalViolationsPages) }, (_, i) => {
                          let pageNum;
                          if (totalViolationsPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalViolationsPages - 2) {
                            pageNum = totalViolationsPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.min(totalViolationsPages, currentPage + 1))}
                        disabled={currentPage === totalViolationsPages}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ======================= TAB: SUMMARY ======================= */}
            <TabsContent value="summary" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Rekap Poin Per Siswa</CardTitle>
                  <CardDescription>
                    Total poin pelanggaran setiap siswa
                    {isDateFilterActive && ` — ${dateFilterLabel}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">No</TableHead>
                          <TableHead>Nama Siswa</TableHead>
                          <TableHead>NIS</TableHead>
                          <TableHead>Kelas</TableHead>
                          <TableHead>Total Poin</TableHead>
                          <TableHead>Jumlah Pelanggaran</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedStudentPoints.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8">
                              <div className="flex flex-col items-center gap-2">
                                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                                <p className="text-muted-foreground">Tidak ada data</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortedStudentPoints.map((item: any, index: number) => (
                            <TableRow key={index}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{item.student?.full_name || '-'}</TableCell>
                              <TableCell>{item.student?.nis || '-'}</TableCell>
                              <TableCell>{item.student?.classes?.name || '-'}</TableCell>
                              <TableCell>
                                <span className={`font-semibold ${getPointsColor(item.totalPoints)}`}>
                                  {item.totalPoints}
                                </span>
                              </TableCell>
                              <TableCell>{item.violations.length}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ======================= TAB: LEADERBOARD ======================= */}
            <TabsContent value="leaderboard" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>🏆 Top 10 Siswa dengan Poin Pelanggaran Tertinggi</CardTitle>
                  <CardDescription>
                    Daftar siswa yang perlu perhatian khusus
                    {isDateFilterActive && ` — ${dateFilterLabel}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Peringkat</TableHead>
                          <TableHead>Nama Siswa</TableHead>
                          <TableHead>NIS</TableHead>
                          <TableHead>Kelas</TableHead>
                          <TableHead>Total Poin</TableHead>
                          <TableHead>Jumlah Pelanggaran</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leaderboard.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8">
                              <div className="flex flex-col items-center gap-2">
                                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                                <p className="text-muted-foreground">Tidak ada data</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          leaderboard.map((item: any, index: number) => (
                            <TableRow key={index}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="text-2xl">
                                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{item.student?.full_name || '-'}</TableCell>
                              <TableCell>{item.student?.nis || '-'}</TableCell>
                              <TableCell>{item.student?.classes?.name || '-'}</TableCell>
                              <TableCell>
                                <span className={`font-bold text-lg ${getPointsColor(item.totalPoints)}`}>
                                  {item.totalPoints}
                                </span>
                              </TableCell>
                              <TableCell>{item.violations.length}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ======================= TAB: TYPES ======================= */}
            {canManageTypes && (
              <TabsContent value="types" className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold">Jenis Pelanggaran</h2>
                    <p className="text-muted-foreground">Kelola jenis dan kategori pelanggaran</p>
                  </div>
                  <div className="flex gap-2">
                    <ImportViolationTypes />
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                      <DialogTrigger asChild>
                        <Button onClick={() => setEditingType(null)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Tambah Jenis
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            {editingType ? 'Edit' : 'Tambah'} Jenis Pelanggaran
                          </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleTypeSubmit} className="space-y-4">
                          <div>
                            <Label>Nama Pelanggaran</Label>
                            <Input
                              name="name"
                              defaultValue={editingType?.name}
                              required
                              placeholder="Contoh: Terlambat masuk kelas"
                            />
                          </div>
                          <div>
                            <Label>Deskripsi</Label>
                            <Textarea
                              name="description"
                              defaultValue={editingType?.description}
                              placeholder="Deskripsi pelanggaran (opsional)"
                            />
                          </div>
                          <div>
                            <Label>Kategori</Label>
                            <Select name="category" defaultValue={editingType?.category || 'ringan'}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ringan">Ringan</SelectItem>
                                <SelectItem value="sedang">Sedang</SelectItem>
                                <SelectItem value="berat">Berat</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Poin</Label>
                            <Input
                              type="number"
                              name="points"
                              defaultValue={editingType?.points || 0}
                              required
                              min="0"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setIsDialogOpen(false);
                                setEditingType(null);
                              }}
                            >
                              Batal
                            </Button>
                            <Button type="submit">
                              {editingType ? 'Update' : 'Simpan'}
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Daftar Jenis Pelanggaran</CardTitle>
                    <CardDescription>
                      {violationTypes.filter(v => v.is_active).length} jenis pelanggaran aktif
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">No</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead>Kategori</TableHead>
                            <TableHead>Poin</TableHead>
                            <TableHead>Deskripsi</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {typesLoading ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-8">
                                Loading...
                              </TableCell>
                            </TableRow>
                          ) : violationTypes.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-8">
                                <div className="flex flex-col items-center gap-2">
                                  <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                                  <p className="text-muted-foreground">Tidak ada jenis pelanggaran</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            violationTypes.map((type: any, index: number) => (
                              <TableRow key={type.id}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell className="font-medium">{type.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={getCategoryColor(type.category)}>
                                    {type.category}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <span className={`font-semibold ${getPointsColor(type.points)}`}>
                                    {type.points}
                                  </span>
                                </TableCell>
                                <TableCell className="max-w-xs truncate">
                                  {type.description || '-'}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={type.is_active ? 'default' : 'secondary'}>
                                    {type.is_active ? 'Aktif' : 'Nonaktif'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingType(type);
                                        setIsDialogOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    {type.is_active && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => deleteTypeMutation.mutate(type.id)}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}