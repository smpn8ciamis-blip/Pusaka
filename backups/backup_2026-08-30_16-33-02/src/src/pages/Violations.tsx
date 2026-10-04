import { useState, useMemo } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, AlertTriangle, ArrowUpDown, Search, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { ImportViolationTypes } from '@/components/ImportViolationTypes';
import { StudentSearchSelect } from '@/components/StudentSearchSelect';
import { HighlightText } from '@/components/HighlightText';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';

export default function Violations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViolationDialogOpen, setIsViolationDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [violationSearch, setViolationSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<'date' | 'student' | 'class' | 'points'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const itemsPerPage = 30;

  // Check if user is admin
  const { data: userRole } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      if (error) return null;
      return data?.role;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const isAdmin = userRole === 'admin';

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
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch students
  const { data: students = [] } = useQuery({
    queryKey: ['students'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*, classes(name)')
        .order('full_name');
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });


  // Fetch violations with reporter info and pagination
  const { data: totalViolationsCount } = useQuery({
    queryKey: ['student-violations-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('student_violations')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: violations = [], isLoading: violationsLoading } = useQuery({
    queryKey: ['student-violations', currentPage],
    queryFn: async () => {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      const { data, error } = await supabase
        .from('student_violations')
        .select(`
          *,
          students(full_name, nis, classes(name)),
          violation_types(name, category)
        `)
        .order('violation_date', { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      
      // Fetch reporter profiles separately
      if (data && data.length > 0) {
        const reporterIds = [...new Set(data.map(v => v.reported_by))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', reporterIds);
        
        // Map profiles to violations
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        return data.map(v => ({
          ...v,
          reporter: profileMap.get(v.reported_by)
        }));
      }
      
      return data || [];
    },
    staleTime: 1 * 60 * 1000,
  });

  // Calculate total points per student
  const studentPoints = violations.reduce((acc: any, v: any) => {
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

  // Create leaderboard
  const leaderboard = Object.values(studentPoints)
    .sort((a: any, b: any) => b.totalPoints - a.totalPoints)
    .slice(0, 10);

  const sortedStudentPoints = Object.values(studentPoints).sort(
    (a: any, b: any) => b.totalPoints - a.totalPoints
  );

  const totalViolationsPages = Math.ceil((totalViolationsCount || 0) / itemsPerPage);

  // Sort and filter violations
  const filteredAndSortedViolations = useMemo(() => {
    if (!violations) return [];
    
    // Filter by search term
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
    
    // Sort filtered results
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

  // Create violation type mutation
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
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Update violation type mutation
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
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Delete violation type mutation
  const deleteTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('violation_types').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['violation-types'] });
      toast({ title: 'Jenis pelanggaran berhasil dinonaktifkan' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Delete violation mutation
  const deleteViolationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('student_violations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-violations'] });
      queryClient.invalidateQueries({ queryKey: ['student-violations-count'] });
      toast({ title: 'Pelanggaran berhasil dihapus' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Create violation mutation
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
      toast({ title: 'Pelanggaran berhasil dicatat' });
      setIsViolationDialogOpen(false);
      setSelectedStudentId('');
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

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
    const violationTypeId = formData.get('violation_type_id') as string;
    const violationType = violationTypes.find(v => v.id === violationTypeId);
    
    const data = {
      student_id: formData.get('student_id') as string,
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

  const exportViolationsPDF = async () => {
    try {
      // Fetch school settings
      const { data: settings } = await supabase
        .from('school_settings')
        .select('*')
        .single();

      const doc = new jsPDF();
      
      // Add letterhead
      let yPos = 15;
      if (settings) {
        yPos = await addLetterheadToPDF(doc, {
          school_name: settings.school_name,
          district_name: settings.district_name,
          school_address: settings.school_address,
          school_phone: settings.school_phone,
          logo_url: settings.logo_url,
          right_logo_url: settings.right_logo_url,
          show_address: settings.show_address,
          show_phone: settings.show_phone,
        });
      }

      // Title
      yPos += 5;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('LAPORAN DATA PELANGGARAN SISWA', doc.internal.pageSize.getWidth() / 2, yPos, { align: 'center' });
      
      yPos += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Tanggal Cetak: ${format(new Date(), 'dd MMMM yyyy', { locale: idLocale })}`, 14, yPos);
      doc.text(`Total Pelanggaran: ${filteredAndSortedViolations.length} record`, 14, yPos + 5);

      // Table data
      const tableData = filteredAndSortedViolations.map((violation: any, index: number) => [
        index + 1,
        format(new Date(violation.violation_date), 'dd/MM/yyyy'),
        violation.students?.full_name || '-',
        violation.students?.nis || '-',
        violation.students?.classes?.name || '-',
        violation.violation_types?.name || '-',
        violation.violation_types?.category || '-',
        violation.points,
        violation.reporter?.full_name || '-',
        violation.notes || '-',
      ]);

      autoTable(doc, {
        startY: yPos + 10,
        head: [['No', 'Tanggal', 'Nama Siswa', 'NIS', 'Kelas', 'Jenis Pelanggaran', 'Kategori', 'Poin', 'Pelapor', 'Catatan']],
        body: tableData,
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          overflow: 'linebreak',
          cellWidth: 'wrap',
        },
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 7,
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 25, overflow: 'linebreak' },
          3: { cellWidth: 15, halign: 'center' },
          4: { cellWidth: 12, halign: 'center' },
          5: { cellWidth: 28, overflow: 'linebreak' },
          6: { cellWidth: 15, halign: 'center' },
          7: { cellWidth: 10, halign: 'center' },
          8: { cellWidth: 22, overflow: 'linebreak' },
          9: { cellWidth: 25, overflow: 'linebreak' },
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
        margin: { left: 10, right: 10 },
        tableWidth: 'auto',
      });

      doc.save(`Laporan-Pelanggaran-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF berhasil diunduh' });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({ title: 'Error', description: 'Gagal membuat PDF', variant: 'destructive' });
    }
  };

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Poin Pelanggaran Siswa</h1>
            <p className="text-muted-foreground mt-2">
              Kelola jenis pelanggaran dan catat pelanggaran siswa
            </p>
          </div>

          <Tabs defaultValue="violations" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="violations">Daftar Pelanggaran</TabsTrigger>
              <TabsTrigger value="summary">Rekap Per Siswa</TabsTrigger>
              <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              <TabsTrigger value="types">Jenis Pelanggaran</TabsTrigger>
            </TabsList>

            <TabsContent value="violations" className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama siswa, NIS, kelas, atau jenis pelanggaran..."
                    value={violationSearch}
                    onChange={(e) => setViolationSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={exportViolationsPDF}>
                    <FileDown className="h-4 w-4 mr-2" />
                    Cetak PDF
                  </Button>
                  <Dialog open={isViolationDialogOpen} onOpenChange={setIsViolationDialogOpen}>
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
                        <StudentSearchSelect
                          students={students}
                          value={selectedStudentId}
                          onChange={setSelectedStudentId}
                          label="Siswa"
                          required
                        />

                        <div>
                          <Label>Jenis Pelanggaran</Label>
                          <Select name="violation_type_id" required>
                            <SelectTrigger>
                              <SelectValue placeholder="Pilih jenis pelanggaran" />
                            </SelectTrigger>
                            <SelectContent>
                              {violationTypes.filter(v => v.is_active).map((type: any) => (
                                <SelectItem key={type.id} value={type.id}>
                                  {type.name} ({type.points} poin)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

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
                          <Button type="submit">Simpan</Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Data Pelanggaran</span>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Halaman {currentPage} dari {totalViolationsPages}</span>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    Menampilkan {filteredAndSortedViolations.length} dari {totalViolationsCount} total pelanggaran
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
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
                          {isAdmin && <TableHead className="text-right">Aksi</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {violationsLoading ? (
                          <TableRow>
                            <TableCell colSpan={isAdmin ? 10 : 9} className="text-center py-8">
                              Loading...
                            </TableCell>
                          </TableRow>
                        ) : filteredAndSortedViolations.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={isAdmin ? 10 : 9} className="text-center py-8">
                              <div className="flex flex-col items-center gap-2">
                                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                                <p className="text-muted-foreground">Tidak ada data pelanggaran</p>
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
                              {isAdmin && (
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

            <TabsContent value="summary" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Rekap Poin Per Siswa</CardTitle>
                  <CardDescription>Total poin pelanggaran setiap siswa</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
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

            <TabsContent value="leaderboard" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>🏆 Top 10 Siswa dengan Poin Pelanggaran Tertinggi</CardTitle>
                  <CardDescription>Daftar siswa yang perlu perhatian khusus</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
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

            <TabsContent value="types" className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">Jenis Pelanggaran</h2>
                  <p className="text-muted-foreground">Kelola jenis dan kategori pelanggaran</p>
                </div>
                <div className="flex gap-2">
                  <ImportViolationTypes />
                  {isAdmin && (
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
                  )}
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
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">No</TableHead>
                          <TableHead>Nama</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead>Poin</TableHead>
                          <TableHead>Deskripsi</TableHead>
                          <TableHead>Status</TableHead>
                          {isAdmin && <TableHead className="text-right">Aksi</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {typesLoading ? (
                          <TableRow>
                            <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8">
                              Loading...
                            </TableCell>
                          </TableRow>
                        ) : violationTypes.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8">
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
                              {isAdmin && (
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
                              )}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
