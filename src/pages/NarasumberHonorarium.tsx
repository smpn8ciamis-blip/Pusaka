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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  Plus,
  Eye,
  Trash2,
  Users,
  Wallet,
  Receipt,
  TrendingUp,
  Pencil,
  Search,
  ArrowUpDown,
  Image as ImageIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { NarasumberHonorariumPreview } from '@/components/honorarium/NarasumberHonorariumPreview';
import { NarasumberDocumentationDialog } from '@/components/honorarium/NarasumberDocumentationDialog';

// ============================================================
// TYPES
// ============================================================
interface NarasumberType {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface NarasumberInstructor {
  id: string;
  narasumber_type_id: string;
  name: string;
  nip: string | null;
  nuptk: string | null;
  pangkat_golongan: string | null;
  jabatan: string | null;
  honor_amount: number;
  tax_percentage: number;
  is_active: boolean;
  narasumber_types?: NarasumberType;
}

interface Honorarium {
  id: string;
  instructor_id: string;
  receipt_number: string;
  receipt_date: string;
  payment_month: number;
  payment_year: number;
  honorarium_amount: number;
  tax_percentage: number;
  tax_amount: number;
  net_amount: number;
  activity_name: string | null;
  description: string | null;
  instructors: NarasumberInstructor;
}

// ============================================================
// CONSTANTS & HELPERS
// ============================================================
const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);

const calculateTax = (amount: number, taxPct: number) => {
  const taxAmt = amount * (taxPct / 100);
  return { taxAmt, netAmt: amount - taxAmt };
};

// ============================================================
// COMPONENT
// ============================================================
export default function NarasumberHonorarium() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('honorarium');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [isInstructorDialogOpen, setIsInstructorDialogOpen] = useState(false);

  const [previewHonorarium, setPreviewHonorarium] = useState<Honorarium | null>(null);
  const [documentationHonorarium, setDocumentationHonorarium] = useState<Honorarium | null>(null);
  const [editingHonorarium, setEditingHonorarium] = useState<Honorarium | null>(null);
  const [editingType, setEditingType] = useState<NarasumberType | null>(null);
  const [editingInstructor, setEditingInstructor] = useState<NarasumberInstructor | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [sortField, setSortField] = useState<'name' | 'amount' | 'date' | 'receipt'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Honorarium form state
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const [honorariumAmount, setHonorariumAmount] = useState('');
  const [taxPercentage, setTaxPercentage] = useState('0');
  const [paymentMonth, setPaymentMonth] = useState(new Date().getMonth() + 1);
  const [paymentYear, setPaymentYear] = useState(new Date().getFullYear());
  const [receiptDate, setReceiptDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activityName, setActivityName] = useState('');
  const [description, setDescription] = useState('');

  // Type form state
  const [typeName, setTypeName] = useState('');
  const [typeDescription, setTypeDescription] = useState('');

  // Instructor form state
  const [instructorTypeId, setInstructorTypeId] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [instructorNip, setInstructorNip] = useState('');
  const [instructorNuptk, setInstructorNuptk] = useState('');
  const [instructorPangkat, setInstructorPangkat] = useState('');
  const [instructorJabatan, setInstructorJabatan] = useState('');
  const [instructorHonor, setInstructorHonor] = useState('');
  const [instructorTax, setInstructorTax] = useState('0');

  // ============================================================
  // QUERIES
  // ============================================================
  const { data: types = [] } = useQuery({
    queryKey: ['narasumber-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('narasumber_types')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as NarasumberType[];
    }
  });

  const { data: instructors = [] } = useQuery({
    queryKey: ['narasumber-instructors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('narasumber_instructors')
        .select(`*, narasumber_types (*)`)
        .order('name');
      if (error) throw error;
      return data as NarasumberInstructor[];
    }
  });

  const { data: honorariums = [] } = useQuery({
    queryKey: ['narasumber-honorariums'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('narasumber_honorariums')
        .select(`*, instructors:instructor_id (*, narasumber_types (*))`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Honorarium[];
    }
  });

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings-narasumber'],
    queryFn: async () => {
      const { data, error } = await supabase.from('school_settings').select('*').single();
      if (error) throw error;
      return data;
    }
  });

  // ============================================================
  // TYPE MUTATIONS
  // ============================================================
  const createTypeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('narasumber_types').insert({
        name: typeName,
        description: typeDescription || null,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['narasumber-types'] });
      toast({ title: 'Berhasil', description: 'Jenis narasumber berhasil ditambahkan' });
      resetTypeForm();
      setIsTypeDialogOpen(false);
    },
    onError: (error: Error) =>
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
  });

  const updateTypeMutation = useMutation({
    mutationFn: async () => {
      if (!editingType) return;
      const { error } = await supabase
        .from('narasumber_types')
        .update({ name: typeName, description: typeDescription || null })
        .eq('id', editingType.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['narasumber-types'] });
      toast({ title: 'Berhasil', description: 'Jenis narasumber berhasil diperbarui' });
      resetTypeForm();
      setIsTypeDialogOpen(false);
      setEditingType(null);
    },
    onError: (error: Error) =>
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
  });

  const deleteTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('narasumber_types').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['narasumber-types'] });
      toast({ title: 'Berhasil', description: 'Jenis narasumber berhasil dihapus' });
    },
    onError: (error: Error) =>
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
  });

  // ============================================================
  // INSTRUCTOR MUTATIONS
  // ============================================================
  const createInstructorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('narasumber_instructors').insert({
        narasumber_type_id: instructorTypeId,
        name: instructorName,
        nip: instructorNip || null,
        nuptk: instructorNuptk || null,
        pangkat_golongan: instructorPangkat || null,
        jabatan: instructorJabatan || null,
        honor_amount: parseFloat(instructorHonor) || 0,
        tax_percentage: parseFloat(instructorTax) || 0,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['narasumber-instructors'] });
      toast({ title: 'Berhasil', description: 'Narasumber berhasil ditambahkan' });
      resetInstructorForm();
      setIsInstructorDialogOpen(false);
    },
    onError: (error: Error) =>
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
  });

  const updateInstructorMutation = useMutation({
    mutationFn: async () => {
      if (!editingInstructor) return;
      const { error } = await supabase.from('narasumber_instructors').update({
        narasumber_type_id: instructorTypeId,
        name: instructorName,
        nip: instructorNip || null,
        nuptk: instructorNuptk || null,
        pangkat_golongan: instructorPangkat || null,
        jabatan: instructorJabatan || null,
        honor_amount: parseFloat(instructorHonor) || 0,
        tax_percentage: parseFloat(instructorTax) || 0,
      }).eq('id', editingInstructor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['narasumber-instructors'] });
      toast({ title: 'Berhasil', description: 'Narasumber berhasil diperbarui' });
      resetInstructorForm();
      setIsInstructorDialogOpen(false);
      setEditingInstructor(null);
    },
    onError: (error: Error) =>
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
  });

  const deleteInstructorMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('narasumber_instructors').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['narasumber-instructors'] });
      toast({ title: 'Berhasil', description: 'Narasumber berhasil dihapus' });
    },
    onError: (error: Error) =>
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
  });

  // ============================================================
  // HONORARIUM MUTATIONS
  // ============================================================
  const createHonorariumMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(honorariumAmount) || 0;
      const taxPct = parseFloat(taxPercentage) || 0;
      const { taxAmt, netAmt } = calculateTax(amount, taxPct);

      const monthStr = paymentMonth.toString().padStart(2, '0');
      const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const receiptNumber = `NRS/${paymentYear}/${monthStr}/${randomNum}`;

      const { error } = await supabase.from('narasumber_honorariums').insert({
        instructor_id: selectedInstructorId,
        honorarium_amount: amount,
        tax_percentage: taxPct,
        tax_amount: taxAmt,
        net_amount: netAmt,
        payment_month: paymentMonth,
        payment_year: paymentYear,
        receipt_number: receiptNumber,
        receipt_date: receiptDate,
        activity_name: activityName || null,
        description: description || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['narasumber-honorariums'] });
      toast({ title: 'Berhasil', description: 'Kwitansi honorarium berhasil disimpan' });
      resetHonorariumForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) =>
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
  });

  const updateHonorariumMutation = useMutation({
    mutationFn: async () => {
      if (!editingHonorarium) return;
      const amount = parseFloat(honorariumAmount) || 0;
      const taxPct = parseFloat(taxPercentage) || 0;
      const { taxAmt, netAmt } = calculateTax(amount, taxPct);

      const { error } = await supabase.from('narasumber_honorariums').update({
        instructor_id: selectedInstructorId,
        honorarium_amount: amount,
        tax_percentage: taxPct,
        tax_amount: taxAmt,
        net_amount: netAmt,
        payment_month: paymentMonth,
        payment_year: paymentYear,
        receipt_date: receiptDate,
        activity_name: activityName || null,
        description: description || null,
      }).eq('id', editingHonorarium.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['narasumber-honorariums'] });
      toast({ title: 'Berhasil', description: 'Kwitansi honorarium berhasil diperbarui' });
      resetHonorariumForm();
      setIsDialogOpen(false);
      setEditingHonorarium(null);
    },
    onError: (error: Error) =>
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
  });

  // ⬇️ UPDATE: Hapus dokumentasi di storage sebelum hapus honorarium
  const deleteHonorariumMutation = useMutation({
    mutationFn: async (id: string) => {
      // 1. Ambil daftar file dokumentasi
      const { data: docs } = await supabase
        .from('narasumber_documentation')
        .select('file_path')
        .eq('honorarium_id', id);

      // 2. Hapus file dari storage
      if (docs && docs.length > 0) {
        const { error: storageErr } = await supabase.storage
          .from('narasumber-documentation')
          .remove(docs.map((d) => d.file_path));
        if (storageErr) {
          console.warn('Gagal hapus file storage:', storageErr.message);
        }
      }

      // 3. Hapus record honorarium (FK CASCADE akan hapus metadata dokumentasi)
      const { error } = await supabase.from('narasumber_honorariums').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['narasumber-honorariums'] });
      toast({ title: 'Berhasil', description: 'Kwitansi honorarium & dokumentasinya berhasil dihapus' });
    },
    onError: (error: Error) =>
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
  });

  // ============================================================
  // RESETTERS
  // ============================================================
  const resetTypeForm = () => {
    setTypeName('');
    setTypeDescription('');
  };

  const resetInstructorForm = () => {
    setInstructorTypeId('');
    setInstructorName('');
    setInstructorNip('');
    setInstructorNuptk('');
    setInstructorPangkat('');
    setInstructorJabatan('');
    setInstructorHonor('');
    setInstructorTax('0');
  };

  const resetHonorariumForm = () => {
    setSelectedInstructorId('');
    setHonorariumAmount('');
    setTaxPercentage('0');
    setPaymentMonth(new Date().getMonth() + 1);
    setPaymentYear(new Date().getFullYear());
    setReceiptDate(format(new Date(), 'yyyy-MM-dd'));
    setActivityName('');
    setDescription('');
  };

  // ============================================================
  // HANDLERS
  // ============================================================
  const handleEditType = (type: NarasumberType) => {
    setEditingType(type);
    setTypeName(type.name);
    setTypeDescription(type.description || '');
    setIsTypeDialogOpen(true);
  };

  const handleEditInstructor = (instructor: NarasumberInstructor) => {
    setEditingInstructor(instructor);
    setInstructorTypeId(instructor.narasumber_type_id);
    setInstructorName(instructor.name);
    setInstructorNip(instructor.nip || '');
    setInstructorNuptk(instructor.nuptk || '');
    setInstructorPangkat(instructor.pangkat_golongan || '');
    setInstructorJabatan(instructor.jabatan || '');
    setInstructorHonor(instructor.honor_amount.toString());
    setInstructorTax(instructor.tax_percentage.toString());
    setIsInstructorDialogOpen(true);
  };

  const handleEditHonorarium = (honorarium: Honorarium) => {
    setEditingHonorarium(honorarium);
    setSelectedInstructorId(honorarium.instructor_id);
    setHonorariumAmount(honorarium.honorarium_amount.toString());
    setTaxPercentage(honorarium.tax_percentage.toString());
    setPaymentMonth(honorarium.payment_month);
    setPaymentYear(honorarium.payment_year);
    setReceiptDate(honorarium.receipt_date);
    setActivityName(honorarium.activity_name || '');
    setDescription(honorarium.description || '');
    setIsDialogOpen(true);
  };

  const handleInstructorChange = (instructorId: string) => {
    setSelectedInstructorId(instructorId);
    const instructor = instructors.find(i => i.id === instructorId);
    if (instructor) {
      setHonorariumAmount(instructor.honor_amount.toString());
      setTaxPercentage(instructor.tax_percentage.toString());
    }
  };

  const handlePreview = (honorarium: Honorarium) => {
    if (!schoolSettings) {
      toast({
        title: 'Pengaturan Sekolah Belum Diatur',
        description: 'Silakan atur data sekolah terlebih dahulu di menu Pengaturan.',
        variant: 'destructive',
      });
      return;
    }
    setPreviewHonorarium(honorarium);
  };

  const toggleSort = (field: 'name' | 'amount' | 'date' | 'receipt') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // ============================================================
  // COMPUTED
  // ============================================================
  const preview = useMemo(() => {
    const amount = parseFloat(honorariumAmount) || 0;
    const taxPct = parseFloat(taxPercentage) || 0;
    const { taxAmt, netAmt } = calculateTax(amount, taxPct);
    return { amount, taxPct, taxAmt, netAmt };
  }, [honorariumAmount, taxPercentage]);

  const availableYears = useMemo(
    () => [...new Set(honorariums.map(h => h.payment_year))].sort((a, b) => b - a),
    [honorariums]
  );

  const filteredHonorariums = useMemo(() => {
    let result = [...honorariums];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(h =>
        h.instructors?.name?.toLowerCase().includes(query) ||
        h.receipt_number.toLowerCase().includes(query) ||
        h.instructors?.nip?.toLowerCase().includes(query) ||
        (h.activity_name || '').toLowerCase().includes(query)
      );
    }

    if (filterMonth !== 'all') result = result.filter(h => h.payment_month === parseInt(filterMonth));
    if (filterYear !== 'all') result = result.filter(h => h.payment_year === parseInt(filterYear));

    result.sort((a, b) => {
      let c = 0;
      if (sortField === 'name') c = (a.instructors?.name || '').localeCompare(b.instructors?.name || '');
      else if (sortField === 'amount') c = a.net_amount - b.net_amount;
      else if (sortField === 'receipt') c = a.receipt_number.localeCompare(b.receipt_number);
      else c = new Date(a.receipt_date).getTime() - new Date(b.receipt_date).getTime();
      return sortOrder === 'asc' ? c : -c;
    });

    return result;
  }, [honorariums, searchQuery, filterMonth, filterYear, sortField, sortOrder]);

  const stats = useMemo(() => {
    const cy = new Date().getFullYear();
    const cm = new Date().getMonth() + 1;
    const thisYearData = honorariums.filter(h => h.payment_year === cy);
    const thisMonthData = honorariums.filter(h => h.payment_year === cy && h.payment_month === cm);

    return {
      totalTransactions: honorariums.length,
      totalPajak: honorariums.reduce((s, h) => s + h.tax_amount, 0),
      totalNetto: honorariums.reduce((s, h) => s + h.net_amount, 0),
      thisYearTotal: thisYearData.reduce((s, h) => s + h.net_amount, 0),
      thisMonthTotal: thisMonthData.reduce((s, h) => s + h.net_amount, 0),
      uniqueInstructors: new Set(honorariums.map(h => h.instructor_id)).size,
      thisMonthCount: thisMonthData.length,
    };
  }, [honorariums]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* HEADER */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Honorarium Narasumber</h1>
          <p className="text-muted-foreground">
            Kelola kwitansi pembayaran honorarium narasumber
          </p>
        </div>

        {/* STATISTIK */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Narasumber</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{instructors.length}</div>
              <p className="text-xs text-muted-foreground">
                Pernah menerima honorarium: {stats.uniqueInstructors}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Kwitansi</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalTransactions}</div>
              <p className="text-xs text-muted-foreground">
                Bulan ini: {stats.thisMonthCount} kwitansi
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Netto</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalNetto)}</div>
              <p className="text-xs text-muted-foreground">
                Total pajak: {formatCurrency(stats.totalPajak)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tahun Ini</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.thisYearTotal)}</div>
              <p className="text-xs text-muted-foreground">
                Bulan ini: {formatCurrency(stats.thisMonthTotal)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* TABS */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="honorarium">Daftar Honorarium</TabsTrigger>
            <TabsTrigger value="instructors">Narasumber</TabsTrigger>
            <TabsTrigger value="types">Jenis Narasumber</TabsTrigger>
          </TabsList>

          {/* =========================== HONORARIUM TAB =========================== */}
          <TabsContent value="honorarium" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama, NIP, no. kwitansi, atau kegiatan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Bulan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Bulan</SelectItem>
                    {MONTHS.map((month, idx) => (
                      <SelectItem key={idx} value={(idx + 1).toString()}>{month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterYear} onValueChange={setFilterYear}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Tahun" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    {availableYears.map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                  if (!open) {
                    resetHonorariumForm();
                    setEditingHonorarium(null);
                  }
                  setIsDialogOpen(open);
                }}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Honorarium
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingHonorarium ? 'Edit Kwitansi Honorarium' : 'Tambah Kwitansi Honorarium'}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Pilih Narasumber</Label>
                      <Select value={selectedInstructorId} onValueChange={handleInstructorChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih narasumber..." />
                        </SelectTrigger>
                        <SelectContent>
                          {instructors.filter(i => i.is_active).map((instructor) => (
                            <SelectItem key={instructor.id} value={instructor.id}>
                              {instructor.name} - {instructor.narasumber_types?.name || 'N/A'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Nama Kegiatan</Label>
                      <Input
                        placeholder="Contoh: Workshop Kurikulum Merdeka"
                        value={activityName}
                        onChange={(e) => setActivityName(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Bulan Pembayaran</Label>
                        <Select
                          value={paymentMonth.toString()}
                          onValueChange={(v) => setPaymentMonth(parseInt(v))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MONTHS.map((month, idx) => (
                              <SelectItem key={idx} value={(idx + 1).toString()}>{month}</SelectItem>
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
                      <Label>Tanggal Kwitansi</Label>
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
                        placeholder="Contoh: 500000"
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
                      <Label>Uraian Pembayaran (opsional)</Label>
                      <Textarea
                        placeholder="Uraian tambahan untuk kwitansi..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                      />
                    </div>

                    <Card className="bg-muted/50">
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <span>Honorarium Bruto:</span>
                          <span className="text-right font-medium">{formatCurrency(preview.amount)}</span>
                          <span>Pajak ({preview.taxPct}%):</span>
                          <span className="text-right text-red-500">-{formatCurrency(preview.taxAmt)}</span>
                          <span className="font-bold">Netto:</span>
                          <span className="text-right font-bold text-green-600">{formatCurrency(preview.netAmt)}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Button
                      onClick={() =>
                        editingHonorarium
                          ? updateHonorariumMutation.mutate()
                          : createHonorariumMutation.mutate()
                      }
                      disabled={!selectedInstructorId || !honorariumAmount}
                      className="w-full"
                    >
                      {editingHonorarium ? 'Perbarui' : 'Simpan'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="cursor-pointer" onClick={() => toggleSort('receipt')}>
                          No. Kwitansi <ArrowUpDown className="inline h-4 w-4 ml-1" />
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => toggleSort('name')}>
                          Nama Narasumber <ArrowUpDown className="inline h-4 w-4 ml-1" />
                        </TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>Kegiatan</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead className="cursor-pointer" onClick={() => toggleSort('amount')}>
                          Netto <ArrowUpDown className="inline h-4 w-4 ml-1" />
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => toggleSort('date')}>
                          Tanggal <ArrowUpDown className="inline h-4 w-4 ml-1" />
                        </TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHonorariums.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground">
                            Belum ada data kwitansi honorarium
                          </TableCell>
                        </TableRow>
                      ) : filteredHonorariums.map((honorarium) => (
                        <TableRow key={honorarium.id}>
                          <TableCell className="font-mono text-xs">{honorarium.receipt_number}</TableCell>
                          <TableCell className="font-medium">{honorarium.instructors?.name || 'N/A'}</TableCell>
                          <TableCell>{honorarium.instructors?.narasumber_types?.name || '-'}</TableCell>
                          <TableCell className="max-w-xs truncate">{honorarium.activity_name || '-'}</TableCell>
                          <TableCell>{MONTHS[honorarium.payment_month - 1]} {honorarium.payment_year}</TableCell>
                          <TableCell>{formatCurrency(honorarium.net_amount)}</TableCell>
                          <TableCell>
                            {format(new Date(honorarium.receipt_date), 'd MMM yyyy', { locale: idLocale })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {/* Preview Kwitansi */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handlePreview(honorarium)}
                                title="Preview Kwitansi"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              {/* ⬇️ TOMBOL BARU: Dokumentasi Kegiatan */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDocumentationHonorarium(honorarium)}
                                title="Dokumentasi Kegiatan"
                              >
                                <ImageIcon className="h-4 w-4" />
                              </Button>

                              {/* Edit */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditHonorarium(honorarium)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>

                              {/* Hapus */}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm('Hapus kwitansi honorarium ini beserta dokumentasinya?'))
                                    deleteHonorariumMutation.mutate(honorarium.id);
                                }}
                                title="Hapus"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================== INSTRUCTORS TAB =========================== */}
          <TabsContent value="instructors" className="space-y-4">
            <div className="flex justify-end">
              <Dialog
                open={isInstructorDialogOpen}
                onOpenChange={(open) => {
                  if (!open) {
                    resetInstructorForm();
                    setEditingInstructor(null);
                  }
                  setIsInstructorDialogOpen(open);
                }}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Narasumber
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingInstructor ? 'Edit Narasumber' : 'Tambah Narasumber'}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Jenis Narasumber</Label>
                      <Select value={instructorTypeId} onValueChange={setInstructorTypeId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih jenis narasumber..." />
                        </SelectTrigger>
                        <SelectContent>
                          {types.filter(t => t.is_active).map((type) => (
                            <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Nama Narasumber</Label>
                      <Input value={instructorName} onChange={(e) => setInstructorName(e.target.value)} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>NIP (opsional)</Label>
                        <Input value={instructorNip} onChange={(e) => setInstructorNip(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>NUPTK (opsional)</Label>
                        <Input value={instructorNuptk} onChange={(e) => setInstructorNuptk(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Pangkat/Golongan</Label>
                        <Input value={instructorPangkat} onChange={(e) => setInstructorPangkat(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Jabatan</Label>
                        <Input value={instructorJabatan} onChange={(e) => setInstructorJabatan(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Honor per Bulan (Rp)</Label>
                        <Input
                          type="number"
                          value={instructorHonor}
                          onChange={(e) => setInstructorHonor(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Pajak (%)</Label>
                        <Input
                          type="number"
                          value={instructorTax}
                          onChange={(e) => setInstructorTax(e.target.value)}
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() =>
                        editingInstructor
                          ? updateInstructorMutation.mutate()
                          : createInstructorMutation.mutate()
                      }
                      disabled={!instructorTypeId || !instructorName}
                      className="w-full"
                    >
                      {editingInstructor ? 'Perbarui' : 'Simpan'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>NIP</TableHead>
                        <TableHead>NUPTK</TableHead>
                        <TableHead>Honor</TableHead>
                        <TableHead>Pajak</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {instructors.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            Belum ada data narasumber
                          </TableCell>
                        </TableRow>
                      ) : instructors.map((instructor) => (
                        <TableRow key={instructor.id}>
                          <TableCell className="font-medium">{instructor.name}</TableCell>
                          <TableCell>{instructor.narasumber_types?.name || '-'}</TableCell>
                          <TableCell>{instructor.nip || '-'}</TableCell>
                          <TableCell>{instructor.nuptk || '-'}</TableCell>
                          <TableCell>{formatCurrency(instructor.honor_amount)}</TableCell>
                          <TableCell>{instructor.tax_percentage}%</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => handleEditInstructor(instructor)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm('Hapus narasumber ini?'))
                                    deleteInstructorMutation.mutate(instructor.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================== TYPES TAB =========================== */}
          <TabsContent value="types" className="space-y-4">
            <div className="flex justify-end">
              <Dialog
                open={isTypeDialogOpen}
                onOpenChange={(open) => {
                  if (!open) {
                    resetTypeForm();
                    setEditingType(null);
                  }
                  setIsTypeDialogOpen(open);
                }}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Jenis Narasumber
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingType ? 'Edit Jenis Narasumber' : 'Tambah Jenis Narasumber'}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nama Jenis</Label>
                      <Input
                        value={typeName}
                        onChange={(e) => setTypeName(e.target.value)}
                        placeholder="Contoh: Workshop, Seminar, dll"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Deskripsi (opsional)</Label>
                      <Input value={typeDescription} onChange={(e) => setTypeDescription(e.target.value)} />
                    </div>
                    <Button
                      onClick={() => editingType ? updateTypeMutation.mutate() : createTypeMutation.mutate()}
                      disabled={!typeName}
                      className="w-full"
                    >
                      {editingType ? 'Perbarui' : 'Simpan'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Jenis</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead>Jumlah Narasumber</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {types.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Belum ada jenis narasumber
                        </TableCell>
                      </TableRow>
                    ) : types.map((type) => (
                      <TableRow key={type.id}>
                        <TableCell className="font-medium">{type.name}</TableCell>
                        <TableCell>{type.description || '-'}</TableCell>
                        <TableCell>{instructors.filter(i => i.narasumber_type_id === type.id).length}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => handleEditType(type)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => {
                                if (confirm('Hapus jenis narasumber ini?'))
                                  deleteTypeMutation.mutate(type.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* PREVIEW KWITANSI */}
        {previewHonorarium && schoolSettings && (
          <NarasumberHonorariumPreview
            honorarium={previewHonorarium}
            schoolSettings={schoolSettings}
            open={!!previewHonorarium}
            onOpenChange={(open) => !open && setPreviewHonorarium(null)}
          />
        )}

        {/* ⬇️ DIALOG BARU: DOKUMENTASI KEGIATAN */}
        {documentationHonorarium && schoolSettings && (
          <NarasumberDocumentationDialog
            open={!!documentationHonorarium}
            onOpenChange={(open) => !open && setDocumentationHonorarium(null)}
            honorarium={documentationHonorarium}
            schoolSettings={schoolSettings}
          />
        )}
      </div>
    </DashboardLayout>
  );
}