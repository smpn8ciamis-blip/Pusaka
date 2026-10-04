import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Plus, Eye, Trash2, FileText, Users, Wallet, Receipt, TrendingUp, Pencil, Search, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { GttPttHonorariumPreview } from '@/components/honorarium/GttPttHonorariumPreview';

interface Teacher {
  id: string;
  nip: string | null;
  nuptk: string | null;
  subject: string;
  pangkat_golongan: string | null;
  jabatan: string | null;
  profiles: {
    full_name: string;
  } | null;
}

interface Honorarium {
  id: string;
  teacher_id: string;
  honorarium_amount: number;
  tax_percentage: number;
  tax_amount: number;
  net_amount: number;
  payment_month: number;
  payment_year: number;
  receipt_number: string;
  receipt_date: string;
  description: string | null;
  teachers: Teacher;
}

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function GttPttHonorarium() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [previewHonorarium, setPreviewHonorarium] = useState<Honorarium | null>(null);
  const [editingHonorarium, setEditingHonorarium] = useState<Honorarium | null>(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [sortField, setSortField] = useState<'name' | 'amount' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Form state
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [honorariumAmount, setHonorariumAmount] = useState('');
  const [taxPercentage, setTaxPercentage] = useState('0');
  const [paymentMonth, setPaymentMonth] = useState(new Date().getMonth() + 1);
  const [paymentYear, setPaymentYear] = useState(new Date().getFullYear());
  const [receiptDate, setReceiptDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');

  // Fetch teachers
  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers-for-honorarium'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select(`
          id,
          nip,
          nuptk,
          subject,
          pangkat_golongan,
          jabatan,
          user_id
        `)
        .order('subject');
      
      if (error) throw error;

      // Fetch profiles for teacher names
      const userIds = data.map(t => t.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      return data.map(teacher => ({
        ...teacher,
        profiles: profiles?.find(p => p.id === teacher.user_id) || null
      }));
    }
  });

  // Fetch honorariums
  const { data: honorariums = [] } = useQuery({
    queryKey: ['gtt-ptt-honorariums'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gtt_ptt_honorariums')
        .select(`
          *,
          teachers:teacher_id (
            id,
            nip,
            nuptk,
            subject,
            pangkat_golongan,
            jabatan,
            user_id
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      // Fetch profiles for teacher names
      const userIds = data.map(h => h.teachers?.user_id).filter(Boolean);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      return data.map(honorarium => ({
        ...honorarium,
        teachers: {
          ...honorarium.teachers,
          profiles: profiles?.find(p => p.id === honorarium.teachers?.user_id) || null
        }
      }));
    }
  });

  // Fetch school settings
  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings-honorarium'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings')
        .select('*')
        .single();
      if (error) throw error;
      return data;
    }
  });

  // Create honorarium mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(honorariumAmount) || 0;
      const taxPct = parseFloat(taxPercentage) || 0;
      const taxAmt = amount * (taxPct / 100);
      const netAmt = amount - taxAmt;

      // Generate receipt number
      const monthStr = paymentMonth.toString().padStart(2, '0');
      const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const receiptNumber = `HON/${paymentYear}/${monthStr}/${randomNum}`;

      const { error } = await supabase
        .from('gtt_ptt_honorariums')
        .insert({
          teacher_id: selectedTeacherId,
          honorarium_amount: amount,
          tax_percentage: taxPct,
          tax_amount: taxAmt,
          net_amount: netAmt,
          payment_month: paymentMonth,
          payment_year: paymentYear,
          receipt_number: receiptNumber,
          receipt_date: receiptDate,
          description: description || null,
          created_by: user?.id
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gtt-ptt-honorariums'] });
      toast({ title: 'Berhasil', description: 'Data honorarium berhasil disimpan' });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  // Update honorarium mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingHonorarium) return;
      
      const amount = parseFloat(honorariumAmount) || 0;
      const taxPct = parseFloat(taxPercentage) || 0;
      const taxAmt = amount * (taxPct / 100);
      const netAmt = amount - taxAmt;

      const { error } = await supabase
        .from('gtt_ptt_honorariums')
        .update({
          teacher_id: selectedTeacherId,
          honorarium_amount: amount,
          tax_percentage: taxPct,
          tax_amount: taxAmt,
          net_amount: netAmt,
          payment_month: paymentMonth,
          payment_year: paymentYear,
          receipt_date: receiptDate,
          description: description || null,
        })
        .eq('id', editingHonorarium.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gtt-ptt-honorariums'] });
      toast({ title: 'Berhasil', description: 'Data honorarium berhasil diperbarui' });
      resetForm();
      setIsDialogOpen(false);
      setEditingHonorarium(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  // Delete honorarium mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('gtt_ptt_honorariums')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gtt-ptt-honorariums'] });
      toast({ title: 'Berhasil', description: 'Data honorarium berhasil dihapus' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const resetForm = () => {
    setSelectedTeacherId('');
    setHonorariumAmount('');
    setTaxPercentage('0');
    setPaymentMonth(new Date().getMonth() + 1);
    setPaymentYear(new Date().getFullYear());
    setReceiptDate(format(new Date(), 'yyyy-MM-dd'));
    setDescription('');
  };

  const handleEdit = (honorarium: Honorarium) => {
    setEditingHonorarium(honorarium);
    setSelectedTeacherId(honorarium.teacher_id);
    setHonorariumAmount(honorarium.honorarium_amount.toString());
    setTaxPercentage(honorarium.tax_percentage.toString());
    setPaymentMonth(honorarium.payment_month);
    setPaymentYear(honorarium.payment_year);
    setReceiptDate(honorarium.receipt_date);
    setDescription(honorarium.description || '');
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      resetForm();
      setEditingHonorarium(null);
    }
    setIsDialogOpen(open);
  };

  const calculatePreview = () => {
    const amount = parseFloat(honorariumAmount) || 0;
    const taxPct = parseFloat(taxPercentage) || 0;
    const taxAmt = amount * (taxPct / 100);
    const netAmt = amount - taxAmt;
    return { amount, taxPct, taxAmt, netAmt };
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value);
  };

  const preview = calculatePreview();

  // Get unique years from data
  const availableYears = useMemo(() => {
    const years = [...new Set(honorariums.map(h => h.payment_year))].sort((a, b) => b - a);
    return years;
  }, [honorariums]);

  // Filter and sort honorariums
  const filteredHonorariums = useMemo(() => {
    let result = [...honorariums];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(h => 
        h.teachers?.profiles?.full_name?.toLowerCase().includes(query) ||
        h.receipt_number.toLowerCase().includes(query) ||
        h.teachers?.nip?.toLowerCase().includes(query) ||
        h.teachers?.nuptk?.toLowerCase().includes(query)
      );
    }
    
    // Month filter
    if (filterMonth !== 'all') {
      result = result.filter(h => h.payment_month === parseInt(filterMonth));
    }
    
    // Year filter
    if (filterYear !== 'all') {
      result = result.filter(h => h.payment_year === parseInt(filterYear));
    }
    
    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = (a.teachers?.profiles?.full_name || '').localeCompare(b.teachers?.profiles?.full_name || '');
          break;
        case 'amount':
          comparison = a.net_amount - b.net_amount;
          break;
        case 'date':
          comparison = new Date(a.receipt_date).getTime() - new Date(b.receipt_date).getTime();
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [honorariums, searchQuery, filterMonth, filterYear, sortField, sortOrder]);

  const toggleSort = (field: 'name' | 'amount' | 'date') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    const thisYearData = honorariums.filter(h => h.payment_year === currentYear);
    const thisMonthData = honorariums.filter(h => h.payment_year === currentYear && h.payment_month === currentMonth);
    
    const totalBruto = honorariums.reduce((sum, h) => sum + h.honorarium_amount, 0);
    const totalPajak = honorariums.reduce((sum, h) => sum + h.tax_amount, 0);
    const totalNetto = honorariums.reduce((sum, h) => sum + h.net_amount, 0);
    const thisYearTotal = thisYearData.reduce((sum, h) => sum + h.net_amount, 0);
    const thisMonthTotal = thisMonthData.reduce((sum, h) => sum + h.net_amount, 0);
    
    // Count unique teachers
    const uniqueTeachers = new Set(honorariums.map(h => h.teacher_id)).size;
    
    return {
      totalTransactions: honorariums.length,
      totalBruto,
      totalPajak,
      totalNetto,
      thisYearTotal,
      thisMonthTotal,
      uniqueTeachers,
      thisMonthCount: thisMonthData.length
    };
  }, [honorariums]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Honorarium GTT/PTT</h1>
            <p className="text-muted-foreground">Kelola pembayaran honorarium guru tidak tetap dan pegawai tidak tetap</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Honorarium
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingHonorarium ? 'Edit Honorarium GTT/PTT' : 'Tambah Honorarium GTT/PTT'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Pilih Guru/Pegawai</Label>
                  <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih guru/pegawai..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.profiles?.full_name || 'N/A'} - {teacher.subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bulan Pembayaran</Label>
                    <Select 
                      value={paymentMonth.toString()} 
                      onValueChange={(v) => setPaymentMonth(parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((month, idx) => (
                          <SelectItem key={idx} value={(idx + 1).toString()}>
                            {month}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tahun Pembayaran</Label>
                    <Input
                      type="number"
                      value={paymentYear}
                      onChange={(e) => setPaymentYear(parseInt(e.target.value) || new Date().getFullYear())}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tanggal Kwitansi (Titi Mangsa & Tanggal Lunas)</Label>
                  <Input
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Jumlah Honorarium (Rp)</Label>
                  <Input
                    type="number"
                    placeholder="Contoh: 1500000"
                    value={honorariumAmount}
                    onChange={(e) => setHonorariumAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Pajak (%)</Label>
                  <Input
                    type="number"
                    placeholder="Contoh: 2.5"
                    value={taxPercentage}
                    onChange={(e) => setTaxPercentage(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Keterangan (opsional)</Label>
                  <Input
                    placeholder="Keterangan tambahan..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                {/* Preview calculation */}
                <Card className="bg-muted/50">
                  <CardContent className="pt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Honorarium Bruto:</span>
                      <span className="font-medium">{formatCurrency(preview.amount)}</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>Pajak ({preview.taxPct}%):</span>
                      <span>- {formatCurrency(preview.taxAmt)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t pt-2">
                      <span>Honorarium Netto:</span>
                      <span className="text-primary">{formatCurrency(preview.netAmt)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Button 
                  className="w-full" 
                  onClick={() => editingHonorarium ? updateMutation.mutate() : createMutation.mutate()}
                  disabled={!selectedTeacherId || !honorariumAmount || createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending 
                    ? 'Menyimpan...' 
                    : editingHonorarium 
                      ? 'Perbarui Honorarium' 
                      : 'Simpan Honorarium'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Penerima</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueTeachers}</div>
              <p className="text-xs text-muted-foreground">GTT/PTT terdaftar</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Transaksi</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalTransactions}</div>
              <p className="text-xs text-muted-foreground">{stats.thisMonthCount} bulan ini</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Netto</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalNetto)}</div>
              <p className="text-xs text-muted-foreground">Pajak: {formatCurrency(stats.totalPajak)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tahun Ini</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.thisYearTotal)}</div>
              <p className="text-xs text-muted-foreground">Bulan ini: {formatCurrency(stats.thisMonthTotal)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Daftar Honorarium
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter and Search */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, NIP, NUPTK, atau nomor kwitansi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Bulan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Bulan</SelectItem>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={idx} value={(idx + 1).toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Tahun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tahun</SelectItem>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="-ml-3 h-8"
                      onClick={() => toggleSort('name')}
                    >
                      Nama Guru/Pegawai
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="-mr-3 h-8"
                      onClick={() => toggleSort('amount')}
                    >
                      Honorarium
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">Pajak</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="-ml-3 h-8"
                      onClick={() => toggleSort('date')}
                    >
                      Tanggal
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHonorariums.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {honorariums.length === 0 ? 'Belum ada data honorarium' : 'Tidak ada data yang sesuai filter'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHonorariums.map((honorarium) => (
                    <TableRow key={honorarium.id}>
                      <TableCell className="font-medium">
                        {honorarium.teachers?.profiles?.full_name || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {MONTHS[honorarium.payment_month - 1]} {honorarium.payment_year}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(honorarium.honorarium_amount)}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {formatCurrency(honorarium.tax_amount)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-primary">
                        {formatCurrency(honorarium.net_amount)}
                      </TableCell>
                      <TableCell>
                        {format(new Date(honorarium.receipt_date), 'd MMMM yyyy', { locale: idLocale })}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setPreviewHonorarium(honorarium)}
                            title="Preview Kwitansi"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(honorarium)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm('Hapus data honorarium ini?')) {
                                deleteMutation.mutate(honorarium.id);
                              }
                            }}
                            title="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Preview Dialog */}
      {previewHonorarium && schoolSettings && (
        <GttPttHonorariumPreview
          honorarium={previewHonorarium}
          schoolSettings={schoolSettings}
          open={!!previewHonorarium}
          onOpenChange={(open) => !open && setPreviewHonorarium(null)}
        />
      )}
    </DashboardLayout>
  );
}
