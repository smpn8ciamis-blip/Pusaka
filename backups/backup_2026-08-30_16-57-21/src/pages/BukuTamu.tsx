import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Printer, Search, Edit, Trash2, Users, Clock, Filter, X, UserPlus, Building } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import { useCountAnimation } from '@/hooks/useCountAnimation';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const ITEMS_PER_PAGE = 10;

const PURPOSE_OPTIONS = [
  'Kunjungan Orang Tua',
  'Urusan Administrasi',
  'Pertemuan',
  'Survei/Penelitian',
  'Pengiriman Barang',
  'Tamu Dinas',
  'Lainnya',
];

export default function BukuTamu() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPurpose, setFilterPurpose] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterEndDate, setFilterEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [currentPage, setCurrentPage] = useState(1);

  const [formData, setFormData] = useState({
    visitor_name: '',
    visitor_phone: '',
    visitor_institution: '',
    purpose: '',
    visit_date: format(new Date(), 'yyyy-MM-dd'),
    visit_time: format(new Date(), 'HH:mm'),
    departure_time: '',
    notes: '',
  });

  // Fetch guest book entries
  const { data: entries, isLoading } = useQuery({
    queryKey: ['guest-book', filterStartDate, filterEndDate],
    queryFn: async () => {
      let query = supabase
        .from('guest_book')
        .select('*')
        .gte('visit_date', filterStartDate)
        .lte('visit_date', filterEndDate)
        .order('visit_date', { ascending: false })
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('guest_book').insert([{
        ...data,
        visit_time: data.visit_time || null,
        departure_time: data.departure_time || null,
        notes: data.notes || null,
        visitor_phone: data.visitor_phone || null,
        visitor_institution: data.visitor_institution || null,
        recorded_by: user?.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-book'] });
      setIsCreateOpen(false);
      resetForm();
      toast.success('Data tamu berhasil ditambahkan');
    },
    onError: (e: any) => toast.error('Gagal menyimpan: ' + e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from('guest_book').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-book'] });
      setIsEditOpen(false);
      setEditingItem(null);
      toast.success('Data tamu berhasil diperbarui');
    },
    onError: (e: any) => toast.error('Gagal memperbarui: ' + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('guest_book').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-book'] });
      toast.success('Data tamu berhasil dihapus');
    },
    onError: (e: any) => toast.error('Gagal menghapus: ' + e.message),
  });

  const resetForm = () => {
    setFormData({
      visitor_name: '',
      visitor_phone: '',
      visitor_institution: '',
      purpose: '',
      visit_date: format(new Date(), 'yyyy-MM-dd'),
      visit_time: format(new Date(), 'HH:mm'),
      departure_time: '',
      notes: '',
    });
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      visitor_name: item.visitor_name,
      visitor_phone: item.visitor_phone || '',
      visitor_institution: item.visitor_institution || '',
      purpose: item.purpose,
      visit_date: item.visit_date,
      visit_time: item.visit_time || '',
      departure_time: item.departure_time || '',
      notes: item.notes || '',
    });
    setIsEditOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus data tamu ini?')) {
      deleteMutation.mutate(id);
    }
  };

  // Filter and paginate
  const filteredData = useMemo(() => {
    if (!entries) return [];
    return entries.filter(item => {
      const matchSearch = !searchQuery || 
        item.visitor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.visitor_institution || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchPurpose = filterPurpose === 'all' || item.purpose === filterPurpose;
      return matchSearch && matchPurpose;
    });
  }, [entries, searchQuery, filterPurpose]);

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Stats
  const stats = useMemo(() => {
    if (!entries) return { total: 0, byPurpose: [] as { name: string; value: number }[] };
    const purposeMap: Record<string, number> = {};
    entries.forEach(e => {
      purposeMap[e.purpose] = (purposeMap[e.purpose] || 0) + 1;
    });
    return {
      total: entries.length,
      byPurpose: Object.entries(purposeMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    };
  }, [entries]);

  const animatedTotal = useCountAnimation(stats.total);
  const todayCount = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return entries?.filter(e => e.visit_date === today).length || 0;
  }, [entries]);
  const animatedToday = useCountAnimation(todayCount);

  // Print recap
  const handlePrintRecap = async () => {
    const doc = new jsPDF();
    const startY = await addLetterheadToPDF(doc);

    let y = startY + 5;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP BUKU TAMU', 105, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periode: ${format(new Date(filterStartDate), 'dd MMMM yyyy', { locale: idLocale })} - ${format(new Date(filterEndDate), 'dd MMMM yyyy', { locale: idLocale })}`, 105, y, { align: 'center' });
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [['No', 'Tanggal', 'Nama Tamu', 'Instansi', 'No. HP', 'Tujuan', 'Jam Datang', 'Jam Pulang', 'Catatan']],
      body: filteredData.map((item, idx) => [
        idx + 1,
        format(new Date(item.visit_date), 'dd/MM/yyyy'),
        item.visitor_name,
        item.visitor_institution || '-',
        item.visitor_phone || '-',
        item.purpose,
        item.visit_time || '-',
        item.departure_time || '-',
        item.notes || '-',
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`Rekap_Buku_Tamu_${filterStartDate}_${filterEndDate}.pdf`);
    toast.success('Rekap berhasil dicetak');
  };

  const clearFilters = () => {
    setFilterStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setFilterEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    setFilterPurpose('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const renderForm = () => (
    <div className="space-y-4">
      <div>
        <Label>Nama Tamu *</Label>
        <Input value={formData.visitor_name} onChange={e => setFormData(p => ({ ...p, visitor_name: e.target.value }))} placeholder="Nama lengkap tamu" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>No. HP</Label>
          <Input value={formData.visitor_phone} onChange={e => setFormData(p => ({ ...p, visitor_phone: e.target.value }))} placeholder="08xxx" />
        </div>
        <div>
          <Label>Instansi/Asal</Label>
          <Input value={formData.visitor_institution} onChange={e => setFormData(p => ({ ...p, visitor_institution: e.target.value }))} placeholder="Nama instansi" />
        </div>
      </div>
      <div>
        <Label>Tujuan Kunjungan *</Label>
        <Select value={formData.purpose} onValueChange={v => setFormData(p => ({ ...p, purpose: v }))}>
          <SelectTrigger><SelectValue placeholder="Pilih tujuan" /></SelectTrigger>
          <SelectContent>
            {PURPOSE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Tanggal</Label>
          <Input type="date" value={formData.visit_date} onChange={e => setFormData(p => ({ ...p, visit_date: e.target.value }))} />
        </div>
        <div>
          <Label>Jam Datang</Label>
          <Input type="time" value={formData.visit_time} onChange={e => setFormData(p => ({ ...p, visit_time: e.target.value }))} />
        </div>
        <div>
          <Label>Jam Pulang</Label>
          <Input type="time" value={formData.departure_time} onChange={e => setFormData(p => ({ ...p, departure_time: e.target.value }))} />
        </div>
      </div>
      <div>
        <Label>Catatan</Label>
        <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="Catatan tambahan..." />
      </div>
    </div>
  );

  return (
    <ProtectedRoute allowedRoles={['guru_piket', 'admin']}>
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Buku Tamu</h1>
              <p className="text-muted-foreground">Catat dan kelola data tamu yang berkunjung</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrintRecap} className="gap-2">
                <Printer className="h-4 w-4" /> Cetak Rekap
              </Button>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" onClick={resetForm}>
                    <Plus className="h-4 w-4" /> Tambah Tamu
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Tambah Data Tamu</DialogTitle></DialogHeader>
                  {renderForm()}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Batal</Button>
                    <Button onClick={() => createMutation.mutate(formData)} disabled={!formData.visitor_name || !formData.purpose || createMutation.isPending}>
                      {createMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tamu</CardTitle>
                <Users className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-500">{animatedTotal}</div>
                <p className="text-xs text-muted-foreground">periode ini</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tamu Hari Ini</CardTitle>
                <UserPlus className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{animatedToday}</div>
                <p className="text-xs text-muted-foreground">pengunjung</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tujuan Terbanyak</CardTitle>
                <Building className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-amber-500 truncate">{stats.byPurpose[0]?.name || '-'}</div>
                <p className="text-xs text-muted-foreground">{stats.byPurpose[0]?.value || 0} kunjungan</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Instansi Unik</CardTitle>
                <Building className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-500">
                  {new Set(entries?.map(e => e.visitor_institution).filter(Boolean)).size}
                </div>
                <p className="text-xs text-muted-foreground">instansi berbeda</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          {stats.byPurpose.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Distribusi Tujuan Kunjungan</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.byPurpose}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
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
            <CardHeader><CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4" /> Filter</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label>Pencarian</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Cari nama/instansi..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="pl-10" />
                  </div>
                </div>
                <div>
                  <Label>Dari Tanggal</Label>
                  <Input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
                </div>
                <div>
                  <Label>Sampai Tanggal</Label>
                  <Input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
                </div>
                <div>
                  <Label>Tujuan</Label>
                  <Select value={filterPurpose} onValueChange={v => { setFilterPurpose(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua</SelectItem>
                      {PURPOSE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
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
                      <TableHead>Nama Tamu</TableHead>
                      <TableHead>No. HP</TableHead>
                      <TableHead>Instansi</TableHead>
                      <TableHead>Tujuan</TableHead>
                      <TableHead>Jam</TableHead>
                      <TableHead>Catatan</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          {isLoading ? 'Memuat data...' : 'Belum ada data tamu'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedData.map((item: any, idx: number) => (
                        <TableRow key={item.id}>
                          <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}</TableCell>
                          <TableCell>{format(new Date(item.visit_date), 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="font-medium">{item.visitor_name}</TableCell>
                          <TableCell>{item.visitor_phone || '-'}</TableCell>
                          <TableCell>{item.visitor_institution || '-'}</TableCell>
                          <TableCell>{item.purpose}</TableCell>
                          <TableCell className="text-xs">
                            {item.visit_time ? item.visit_time.slice(0, 5) : '-'}
                            {item.departure_time ? ` - ${item.departure_time.slice(0, 5)}` : ''}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate">{item.notes || '-'}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Edit className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

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
                            <PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page} className="cursor-pointer">{page}</PaginationLink>
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
              <DialogHeader><DialogTitle>Edit Data Tamu</DialogTitle></DialogHeader>
              {renderForm()}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>Batal</Button>
                <Button
                  onClick={() => updateMutation.mutate({
                    id: editingItem?.id,
                    data: {
                      visitor_name: formData.visitor_name,
                      visitor_phone: formData.visitor_phone || null,
                      visitor_institution: formData.visitor_institution || null,
                      purpose: formData.purpose,
                      visit_date: formData.visit_date,
                      visit_time: formData.visit_time || null,
                      departure_time: formData.departure_time || null,
                      notes: formData.notes || null,
                    },
                  })}
                  disabled={!formData.visitor_name || !formData.purpose || updateMutation.isPending}
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
