import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Trash2, Pencil, ArrowUpDown, ChevronLeft, ChevronRight, FileText, UserMinus, Download, Filter, X, Calendar } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { StudentSearchSelect } from '@/components/StudentSearchSelect';
import jsPDF from 'jspdf';

// We need to fetch active students for the select
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';

const ITEMS_PER_PAGE = 10;

function StudentMutationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMutation, setEditingMutation] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'date' | 'name' | 'school'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterReason, setFilterReason] = useState<string>('all');

  // Form state
  const [formStudentId, setFormStudentId] = useState('');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formDestination, setFormDestination] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // PDF report period
  const [reportStartDate, setReportStartDate] = useState(format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'));
  const [reportEndDate, setReportEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

  const { data: activeStudents } = useQuery({
    queryKey: ['active-students-for-mutation'],
    queryFn: async () => {
      // Fetch students and classes separately for VPS compatibility
      const { data: students, error } = await supabase
        .from('students')
        .select('id, full_name, nis, nisn, class_id')
        .eq('status', 'aktif')
        .order('full_name');
      if (error) throw error;
      if (!students || students.length === 0) return [];

      // Fetch classes separately to avoid join issues on VPS
      const classIds = [...new Set(students.map(s => s.class_id).filter(Boolean))];
      let classMap: Record<string, string> = {};
      if (classIds.length > 0) {
        const { data: classes } = await supabase
          .from('classes')
          .select('id, name')
          .in('id', classIds);
        classes?.forEach(c => { classMap[c.id] = c.name; });
      }

      return students.map(s => ({
        ...s,
        classes: s.class_id ? { name: classMap[s.class_id] || 'Tanpa Kelas' } : null,
      }));
    }
  });

  const { data: mutations, isLoading } = useQuery({
    queryKey: ['student-mutations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_mutations')
        .select('*, students(full_name, nis, nisn, class_id, classes(name))')
        .order('mutation_date', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings-letterhead'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_school_settings_for_letterhead');
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingMutation) {
        const { error } = await supabase
          .from('student_mutations')
          .update({
            mutation_date: payload.mutation_date,
            destination_school: payload.destination_school,
            reason: payload.reason,
            notes: payload.notes,
          })
          .eq('id', editingMutation.id);
        if (error) throw error;
      } else {
        // Insert mutation record
        const { error } = await supabase
          .from('student_mutations')
          .insert({
            student_id: payload.student_id,
            mutation_date: payload.mutation_date,
            destination_school: payload.destination_school,
            reason: payload.reason,
            notes: payload.notes,
            created_by: user?.id,
          });
        if (error) throw error;

        // Update student status to 'mutasi'
        const { error: updateErr } = await supabase
          .from('students')
          .update({ status: 'mutasi' })
          .eq('id', payload.student_id);
        if (updateErr) throw updateErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-mutations'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success(editingMutation ? 'Data mutasi berhasil diperbarui' : 'Siswa berhasil dimutasi');
      resetForm();
    },
    onError: (err: any) => toast.error(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (mutation: any) => {
      const { error } = await supabase
        .from('student_mutations')
        .delete()
        .eq('id', mutation.id);
      if (error) throw error;

      // Restore student status
      const { error: updateErr } = await supabase
        .from('students')
        .update({ status: 'aktif' })
        .eq('id', mutation.student_id);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-mutations'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Data mutasi berhasil dihapus, status siswa dikembalikan');
    },
    onError: (err: any) => toast.error(err.message)
  });

  const resetForm = () => {
    setFormStudentId('');
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormDestination('');
    setFormReason('');
    setFormNotes('');
    setEditingMutation(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (m: any) => {
    setEditingMutation(m);
    setFormDate(m.mutation_date);
    setFormDestination(m.destination_school);
    setFormReason(m.reason || '');
    setFormNotes(m.notes || '');
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!editingMutation && !formStudentId) {
      toast.error('Pilih siswa terlebih dahulu');
      return;
    }
    if (!formDestination.trim()) {
      toast.error('Sekolah tujuan harus diisi');
      return;
    }
    saveMutation.mutate({
      student_id: formStudentId,
      mutation_date: formDate,
      destination_school: formDestination,
      reason: formReason,
      notes: formNotes,
    });
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    if (!mutations) return [];
    let result = [...mutations];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(m =>
        m.students?.full_name?.toLowerCase().includes(term) ||
        m.students?.nis?.toLowerCase().includes(term) ||
        m.destination_school?.toLowerCase().includes(term)
      );
    }

    if (filterReason !== 'all') {
      result = result.filter(m => (m.reason || '').toLowerCase().includes(filterReason.toLowerCase()));
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = (a.mutation_date || '').localeCompare(b.mutation_date || '');
          break;
        case 'name':
          cmp = (a.students?.full_name || '').localeCompare(b.students?.full_name || '');
          break;
        case 'school':
          cmp = (a.destination_school || '').localeCompare(b.destination_school || '');
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [mutations, searchTerm, filterReason, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE);
  const paginatedData = filteredAndSorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const generatePDF = async () => {
    const doc = new jsPDF();
    const startY = await addLetterheadToPDF(doc, schoolSettings as any);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN REKAP MUTASI KELUAR SISWA', doc.internal.pageSize.getWidth() / 2, startY, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Periode: ${format(new Date(reportStartDate), 'dd MMMM yyyy', { locale: localeId })} - ${format(new Date(reportEndDate), 'dd MMMM yyyy', { locale: localeId })}`,
      doc.internal.pageSize.getWidth() / 2, startY + 7, { align: 'center' }
    );

    const reportData = (mutations || []).filter(m => {
      const d = m.mutation_date;
      return d >= reportStartDate && d <= reportEndDate;
    });

    autoTable(doc, {
      startY: startY + 14,
      head: [['No', 'Nama Siswa', 'NIS', 'Kelas', 'Tanggal Mutasi', 'Sekolah Tujuan', 'Alasan']],
      body: reportData.map((m, i) => [
        i + 1,
        m.students?.full_name || '-',
        m.students?.nis || '-',
        m.students?.classes?.name || '-',
        format(new Date(m.mutation_date), 'dd/MM/yyyy'),
        m.destination_school,
        m.reason || '-',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || startY + 30;
    doc.setFontSize(9);
    doc.text(`Total siswa mutasi: ${reportData.length}`, 14, finalY + 10);
    doc.text(`Dicetak pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: localeId })}`, 14, finalY + 16);

    doc.save(`Rekap_Mutasi_Siswa_${reportStartDate}_${reportEndDate}.pdf`);
    toast.success('Laporan PDF berhasil diunduh');
    setIsReportDialogOpen(false);
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'kesiswaan']}>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <UserMinus className="h-6 w-6 text-destructive" />
                Mutasi Keluar Siswa
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Kelola data siswa yang pindah/mutasi keluar</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-1" />
                    Cetak Rekap
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cetak Laporan Rekap Mutasi</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Tanggal Mulai</Label>
                      <Input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
                    </div>
                    <div>
                      <Label>Tanggal Akhir</Label>
                      <Input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={generatePDF}>
                      <FileText className="h-4 w-4 mr-1" />
                      Generate PDF
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Tambah Mutasi
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingMutation ? 'Edit Data Mutasi' : 'Tambah Mutasi Keluar'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {!editingMutation && (
                      <div>
                        <Label>Pilih Siswa</Label>
                        <StudentSearchSelect
                          students={(activeStudents || []).map(s => ({ id: s.id, full_name: s.full_name, nis: s.nis, nisn: s.nisn, classes: s.classes }))}
                          value={formStudentId}
                          onChange={setFormStudentId}
                        />
                      </div>
                    )}
                    <div>
                      <Label>Tanggal Mutasi</Label>
                      <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
                    </div>
                    <div>
                      <Label>Sekolah Tujuan <span className="text-destructive">*</span></Label>
                      <Input value={formDestination} onChange={e => setFormDestination(e.target.value)} placeholder="Nama sekolah tujuan" />
                    </div>
                    <div>
                      <Label>Alasan Mutasi</Label>
                      <Select value={formReason} onValueChange={setFormReason}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih alasan" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pindah domisili">Pindah domisili</SelectItem>
                          <SelectItem value="Mengikuti orang tua">Mengikuti orang tua</SelectItem>
                          <SelectItem value="Alasan pribadi">Alasan pribadi</SelectItem>
                          <SelectItem value="Diterima di sekolah lain">Diterima di sekolah lain</SelectItem>
                          <SelectItem value="Lainnya">Lainnya</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Catatan Tambahan</Label>
                      <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Catatan opsional..." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={resetForm}>Batal</Button>
                    <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <UserMinus className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Mutasi</p>
                    <p className="text-2xl font-bold">{mutations?.length || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Bulan Ini</p>
                    <p className="text-2xl font-bold">
                      {mutations?.filter(m => {
                        const d = new Date(m.mutation_date);
                        const now = new Date();
                        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                      }).length || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <FileText className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tahun Ini</p>
                    <p className="text-2xl font-bold">
                      {mutations?.filter(m => new Date(m.mutation_date).getFullYear() === new Date().getFullYear()).length || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter & Search */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama siswa, NIS, atau sekolah tujuan..."
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="pl-9"
                  />
                </div>
                <Select value={filterReason} onValueChange={v => { setFilterReason(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-full sm:w-48">
                    <Filter className="h-4 w-4 mr-1" />
                    <SelectValue placeholder="Filter alasan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Alasan</SelectItem>
                    <SelectItem value="Pindah domisili">Pindah domisili</SelectItem>
                    <SelectItem value="Mengikuti orang tua">Mengikuti orang tua</SelectItem>
                    <SelectItem value="Alasan pribadi">Alasan pribadi</SelectItem>
                    <SelectItem value="Diterima di sekolah lain">Diterima di sekolah lain</SelectItem>
                    <SelectItem value="Lainnya">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
                {(searchTerm || filterReason !== 'all') && (
                  <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); setFilterReason('all'); }}>
                    <X className="h-4 w-4 mr-1" /> Reset
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">Nama Siswa <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead>NIS</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('date')}>
                      <div className="flex items-center gap-1">Tanggal <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('school')}>
                      <div className="flex items-center gap-1">Sekolah Tujuan <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Memuat data...</TableCell></TableRow>
                  ) : paginatedData.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Belum ada data mutasi</TableCell></TableRow>
                  ) : (
                    paginatedData.map((m, i) => (
                      <TableRow key={m.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + i + 1}</TableCell>
                        <TableCell className="font-medium">{m.students?.full_name || '-'}</TableCell>
                        <TableCell>{m.students?.nis || '-'}</TableCell>
                        <TableCell>{m.students?.classes?.name || '-'}</TableCell>
                        <TableCell>{format(new Date(m.mutation_date), 'dd MMM yyyy', { locale: localeId })}</TableCell>
                        <TableCell>{m.destination_school}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{m.reason || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(m)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => {
                              if (confirm('Hapus data mutasi ini? Status siswa akan dikembalikan ke aktif.')) {
                                deleteMutation.mutate(m);
                              }
                            }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSorted.length)} dari {filteredAndSorted.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const page = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                      if (page < 1 || page > totalPages) return null;
                      return (
                        <Button key={page} variant={currentPage === page ? 'default' : 'outline'} size="icon" onClick={() => setCurrentPage(page)}>
                          {page}
                        </Button>
                      );
                    })}
                    <Button variant="outline" size="icon" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

export default StudentMutationsPage;
