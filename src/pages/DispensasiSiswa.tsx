import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Plus, Printer, Search, Edit, Trash2, CalendarIcon, FileText, Users, Clock, Filter, X } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCountAnimation } from '@/hooks/useCountAnimation';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import jsPDF from 'jspdf';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#ec4899'];
const CATEGORIES = [
  { value: 'sakit', label: 'Sakit' },
  { value: 'izin', label: 'Izin' },
  { value: 'kegiatan', label: 'Kegiatan' },
  { value: 'lainnya', label: 'Lainnya' },
];

const ITEMS_PER_PAGE = 10;

export default function DispensasiSiswa() {
  const { user } = useAuth();
  const { selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(endOfMonth(new Date()));
  const [currentPage, setCurrentPage] = useState(1);

  // Form state
  const [formData, setFormData] = useState({
    student_id: '',
    dispensation_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '',
    end_time: '',
    reason: '',
    reason_category: 'izin',
    notes: '',
    letter_number: '',
    letter_date: format(new Date(), 'yyyy-MM-dd'),
  });

  // Fetch students for dropdown
  const { data: students } = useQuery({
    queryKey: ['students-for-dispensasi', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, full_name, nis, class_id')
        .eq('is_alumni', false)
        .eq('status', 'aktif')
        .order('full_name');
      if (error) throw error;

      // Fetch classes separately
      const classIds = [...new Set(data?.map(s => s.class_id).filter(Boolean))];
      let classMap: Record<string, any> = {};
      if (classIds.length > 0) {
        const { data: classes } = await supabase
          .from('classes')
          .select('id, name, grade')
          .in('id', classIds);
        classes?.forEach(c => { classMap[c.id] = c; });
      }

      return data?.map(s => ({
        ...s,
        class_name: classMap[s.class_id]?.name || '',
        grade: classMap[s.class_id]?.grade || 0,
      })) || [];
    },
  });

  // Fetch dispensations
  const { data: dispensations, isLoading } = useQuery({
    queryKey: ['dispensations', filterStartDate?.toISOString(), filterEndDate?.toISOString(), filterCategory],
    queryFn: async () => {
      let query = supabase
        .from('student_dispensations')
        .select(`
          *,
          students:student_id (full_name, nis, class_id)
        `)
        .order('dispensation_date', { ascending: false });

      if (filterStartDate) query = query.gte('dispensation_date', format(filterStartDate, 'yyyy-MM-dd'));
      if (filterEndDate) query = query.lte('dispensation_date', format(filterEndDate, 'yyyy-MM-dd'));
      if (filterCategory !== 'all') query = query.eq('reason_category', filterCategory);

      const { data, error } = await query;
      if (error) throw error;

      // Fetch class names
      const classIds = [...new Set(data?.map((d: any) => (d.students as any)?.class_id).filter(Boolean))];
      let classMap: Record<string, string> = {};
      if (classIds.length > 0) {
        const { data: classes } = await supabase.from('classes').select('id, name').in('id', classIds);
        classes?.forEach(c => { classMap[c.id] = c.name; });
      }

      return data?.map((d: any) => ({
        ...d,
        class_name: classMap[(d.students as any)?.class_id] || '-',
      })) || [];
    },
  });

  // Filtered & paginated data
  const filteredData = useMemo(() => {
    if (!dispensations) return [];
    if (!searchQuery) return dispensations;
    const q = searchQuery.toLowerCase();
    return dispensations.filter((d: any) =>
      (d.students as any)?.full_name?.toLowerCase().includes(q) ||
      (d.students as any)?.nis?.toLowerCase().includes(q) ||
      d.reason?.toLowerCase().includes(q)
    );
  }, [dispensations, searchQuery]);

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Stats
  const stats = useMemo(() => {
    if (!dispensations) return { total: 0, sakit: 0, izin: 0, kegiatan: 0, lainnya: 0 };
    return {
      total: dispensations.length,
      sakit: dispensations.filter((d: any) => d.reason_category === 'sakit').length,
      izin: dispensations.filter((d: any) => d.reason_category === 'izin').length,
      kegiatan: dispensations.filter((d: any) => d.reason_category === 'kegiatan').length,
      lainnya: dispensations.filter((d: any) => d.reason_category === 'lainnya').length,
    };
  }, [dispensations]);

  const chartData = useMemo(() => {
    return CATEGORIES.map(c => ({
      name: c.label,
      value: stats[c.value as keyof typeof stats] as number,
    })).filter(d => d.value > 0);
  }, [stats]);

  const animatedTotal = useCountAnimation(stats.total);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const student = students?.find(s => s.id === data.student_id);
      const { error } = await supabase.from('student_dispensations').insert({
        student_id: data.student_id,
        class_id: student?.class_id || null,
        dispensation_date: data.dispensation_date,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        reason: data.reason,
        reason_category: data.reason_category,
        notes: data.notes || null,
        letter_number: data.letter_number || null,
        letter_date: data.letter_date || null,
        guru_piket_id: user?.id || null,
        created_by: user?.id!,
        status: 'approved',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispensations'] });
      queryClient.invalidateQueries({ queryKey: ['dispensasi-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dispensasi-today'] });
      setIsCreateOpen(false);
      resetForm();
      toast.success('Dispensasi berhasil ditambahkan');
    },
    onError: (error: any) => {
      toast.error('Gagal menambahkan dispensasi: ' + error.message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from('student_dispensations').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispensations'] });
      setIsEditOpen(false);
      setEditingItem(null);
      toast.success('Dispensasi berhasil diperbarui');
    },
    onError: (error: any) => {
      toast.error('Gagal memperbarui: ' + error.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('student_dispensations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispensations'] });
      queryClient.invalidateQueries({ queryKey: ['dispensasi-stats'] });
      toast.success('Dispensasi berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error('Gagal menghapus: ' + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      student_id: '',
      dispensation_date: format(new Date(), 'yyyy-MM-dd'),
      start_time: '',
      end_time: '',
      reason: '',
      reason_category: 'izin',
      notes: '',
      letter_number: '',
      letter_date: format(new Date(), 'yyyy-MM-dd'),
    });
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      student_id: item.student_id,
      dispensation_date: item.dispensation_date,
      start_time: item.start_time || '',
      end_time: item.end_time || '',
      reason: item.reason,
      reason_category: item.reason_category,
      notes: item.notes || '',
      letter_number: item.letter_number || '',
      letter_date: item.letter_date || format(new Date(), 'yyyy-MM-dd'),
    });
    setIsEditOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus dispensasi ini?')) {
      deleteMutation.mutate(id);
    }
  };

  // Print dispensation letter
  const handlePrintLetter = async (item: any) => {
    const doc = new jsPDF();
    
    // Fetch school settings for letterhead
    const { data: schoolSettingsRaw } = await supabase.rpc('get_school_settings_for_letterhead');
    const schoolSettings = schoolSettingsRaw as any;
    const startY = await addLetterheadToPDF(doc, schoolSettings);

    const studentName = (item.students as any)?.full_name || '-';
    const studentNis = (item.students as any)?.nis || '-';
    const className = item.class_name || '-';
    const dateStr = format(new Date(item.dispensation_date), 'dd MMMM yyyy', { locale: idLocale });

    let y = startY + 10;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('SURAT DISPENSASI', 105, y, { align: 'center' });
    y += 7;
    // Letter number and date
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (item.letter_number) {
      doc.text(`Nomor: ${item.letter_number}`, 105, y, { align: 'center' });
      y += 5;
    }
    const letterDateStr = item.letter_date ? format(new Date(item.letter_date), 'dd MMMM yyyy', { locale: idLocale }) : dateStr;
    y += 10;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Yang bertanda tangan di bawah ini, Guru Piket pada hari ini memberikan', 20, y);
    y += 7;
    doc.text('dispensasi kepada siswa:', 20, y);
    y += 12;

    const fields = [
      ['Nama Siswa', studentName],
      ['NIS', studentNis],
      ['Kelas', className],
      ['Tanggal', dateStr],
      ['Waktu', `${item.start_time || '-'} s/d ${item.end_time || '-'}`],
      ['Kategori', item.reason_category],
      ['Alasan', item.reason],
    ];

    fields.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}`, 25, y);
      doc.text(':', 70, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${value}`, 75, y);
      y += 7;
    });

    if (item.notes) {
      y += 3;
      doc.setFont('helvetica', 'bold');
      doc.text('Catatan', 25, y);
      doc.text(':', 70, y);
      doc.setFont('helvetica', 'normal');
      doc.text(item.notes, 75, y);
      y += 7;
    }

    y += 10;
    doc.text('Demikian surat dispensasi ini dibuat untuk dipergunakan sebagaimana mestinya.', 20, y);
    y += 20;

    // Signatures with headmaster name
    const signY = y;
    const headmasterName = schoolSettings?.headmaster_name || '____________________';
    const headmasterNip = schoolSettings?.headmaster_nip || '';

    doc.setFont('helvetica', 'normal');
    doc.text('Guru Piket,', 35, signY, { align: 'center' });
    doc.text(`${(schoolSettings as any)?.headmaster_position || 'Kepala Sekolah'},`, 170, signY, { align: 'center' });

    doc.text('_______________________', 35, signY + 30, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.text(headmasterName, 170, signY + 30, { align: 'center' });
    if (headmasterNip) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`NIP. ${headmasterNip}`, 170, signY + 35, { align: 'center' });
    }

    doc.save(`Surat_Dispensasi_${studentName}_${item.dispensation_date}.pdf`);
    toast.success('Surat dispensasi berhasil dicetak');
  };

  const clearFilters = () => {
    setFilterStartDate(startOfMonth(new Date()));
    setFilterEndDate(endOfMonth(new Date()));
    setFilterCategory('all');
    setSearchQuery('');
  };

  const [studentSearch, setStudentSearch] = useState('');
  const filteredStudents = useMemo(() => {
    if (!students) return [];
    if (!studentSearch) return students.slice(0, 50);
    const q = studentSearch.toLowerCase();
    return students.filter(s => 
      s.full_name.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [students, studentSearch]);

  const renderForm = (isEdit: boolean) => (
    <div className="space-y-4">
      <div>
        <Label>Cari Siswa</Label>
        <Input
          placeholder="Ketik nama atau NIS..."
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
          className="mb-2"
        />
        <Select value={formData.student_id} onValueChange={(v) => setFormData(prev => ({ ...prev, student_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Pilih siswa" /></SelectTrigger>
          <SelectContent>
            {filteredStudents.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.full_name} ({s.nis}) {s.class_name ? `- ${s.class_name}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Tanggal</Label>
          <Input type="date" value={formData.dispensation_date} onChange={e => setFormData(prev => ({ ...prev, dispensation_date: e.target.value }))} />
        </div>
        <div>
          <Label>Kategori</Label>
          <Select value={formData.reason_category} onValueChange={v => setFormData(prev => ({ ...prev, reason_category: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Jam Mulai</Label>
          <Input type="time" value={formData.start_time} onChange={e => setFormData(prev => ({ ...prev, start_time: e.target.value }))} />
        </div>
        <div>
          <Label>Jam Selesai</Label>
          <Input type="time" value={formData.end_time} onChange={e => setFormData(prev => ({ ...prev, end_time: e.target.value }))} />
        </div>
      </div>
      <div>
        <Label>Alasan</Label>
        <Textarea value={formData.reason} onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))} placeholder="Tuliskan alasan dispensasi..." />
      </div>
      <div>
        <Label>Catatan (opsional)</Label>
        <Textarea value={formData.notes} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} placeholder="Catatan tambahan..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Nomor Surat</Label>
          <Input value={formData.letter_number} onChange={e => setFormData(prev => ({ ...prev, letter_number: e.target.value }))} placeholder="Contoh: 001/DISP/2026" />
        </div>
        <div>
          <Label>Tanggal Surat</Label>
          <Input type="date" value={formData.letter_date} onChange={e => setFormData(prev => ({ ...prev, letter_date: e.target.value }))} />
        </div>
      </div>
    </div>
  );

  return (
    <ProtectedRoute allowedRoles={['guru_piket', 'admin', 'kesiswaan']}>
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dispensasi Siswa</h1>
              <p className="text-muted-foreground">Kelola dispensasi siswa yang meninggalkan kelas/sekolah</p>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" onClick={resetForm}>
                  <Plus className="h-4 w-4" /> Tambah Dispensasi
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Tambah Dispensasi Baru</DialogTitle>
                </DialogHeader>
                {renderForm(false)}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Batal</Button>
                  <Button 
                    onClick={() => createMutation.mutate(formData)} 
                    disabled={!formData.student_id || !formData.reason || createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{animatedTotal}</div>
              </CardContent>
            </Card>
            {CATEGORIES.map(c => (
              <Card key={c.value}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{c.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats[c.value as keyof typeof stats]}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Distribusi Dispensasi</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4" /> Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label>Pencarian</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Cari nama/NIS..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="pl-10" />
                  </div>
                </div>
                <div>
                  <Label>Dari Tanggal</Label>
                  <Input type="date" value={filterStartDate ? format(filterStartDate, 'yyyy-MM-dd') : ''} onChange={e => setFilterStartDate(e.target.value ? new Date(e.target.value) : undefined)} />
                </div>
                <div>
                  <Label>Sampai Tanggal</Label>
                  <Input type="date" value={filterEndDate ? format(filterEndDate, 'yyyy-MM-dd') : ''} onChange={e => setFilterEndDate(e.target.value ? new Date(e.target.value) : undefined)} />
                </div>
                <div>
                  <Label>Kategori</Label>
                  <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua</SelectItem>
                      {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="icon" onClick={clearFilters}><X className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          {/* Data Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Nama Siswa</TableHead>
                      <TableHead>NIS</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          {isLoading ? 'Memuat data...' : 'Belum ada data dispensasi'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedData.map((item: any, idx: number) => (
                        <TableRow key={item.id}>
                          <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}</TableCell>
                          <TableCell>{format(new Date(item.dispensation_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="font-medium">{(item.students as any)?.full_name}</TableCell>
                          <TableCell>{(item.students as any)?.nis}</TableCell>
                          <TableCell>{item.class_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{item.reason_category}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.start_time && item.end_time ? `${item.start_time} - ${item.end_time}` : '-'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.reason}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handlePrintLetter(item)}>
                                <Printer className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} dari {filteredData.length} data
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                      </PaginationItem>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const page = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                        if (page < 1 || page > totalPages) return null;
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page} className="cursor-pointer">
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit Dialog */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Dispensasi</DialogTitle>
              </DialogHeader>
              {renderForm(true)}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>Batal</Button>
                <Button
                  onClick={() => updateMutation.mutate({
                    id: editingItem?.id,
                    data: {
                      dispensation_date: formData.dispensation_date,
                      start_time: formData.start_time || null,
                      end_time: formData.end_time || null,
                      reason: formData.reason,
                      reason_category: formData.reason_category,
                      notes: formData.notes || null,
                      letter_number: formData.letter_number || null,
                      letter_date: formData.letter_date || null,
                    },
                  })}
                  disabled={!formData.reason || updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
