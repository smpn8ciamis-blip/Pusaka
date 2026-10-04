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
import { Plus, FileText, Pencil, Printer, Download, ArrowUpDown, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF, addSignatureToPDF } from '@/lib/pdfLetterhead';

const Journals = () => {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingJournal, setEditingJournal] = useState<any>(null);
  const [filterDate, setFilterDate] = useState('');
  const [filterSchedule, setFilterSchedule] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'schedule'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [hasAttendanceData, setHasAttendanceData] = useState<boolean | null>(null);
  const [isCheckingAttendance, setIsCheckingAttendance] = useState(false);
  const [formData, setFormData] = useState({
    schedule_id: '',
    date: new Date().toISOString().split('T')[0],
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
          .order('day_of_week');
        
        if (error) throw error;
        return data;
      }
    },
    enabled: !!user?.id && !!userRole,
  });

  const { data: journals } = useQuery({
    queryKey: ['teaching-journals', userRole, user?.id],
    queryFn: async () => {
      if (userRole === 'admin') {
        const { data, error } = await supabase
          .from('teaching_journals')
          .select('*')
          .order('date', { ascending: false });
        
        if (error) throw error;
        
        // Fetch related data separately
        if (!data) return [];
        
        const journalsWithDetails = await Promise.all(
          data.map(async (journal) => {
            const { data: schedule } = await supabase
              .from('schedules')
              .select('subject, start_time, class_id, classes(name, grade), teacher_id')
              .eq('id', journal.schedule_id)
              .single();
            
            let teacherName = '-';
            if (schedule?.teacher_id) {
              const { data: teacher } = await supabase
                .from('teachers')
                .select('user_id')
                .eq('id', schedule.teacher_id)
                .single();
              
              if (teacher?.user_id) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('full_name')
                  .eq('id', teacher.user_id)
                  .single();
                
                teacherName = profile?.full_name || '-';
              }
            }
            
            return {
              ...journal,
              schedules: schedule,
              teacher_name: teacherName
            };
          })
        );
        
        return journalsWithDetails;
      } else {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();

        if (!teacher) return [];

        // Get teacher's schedule IDs
        const { data: teacherSchedules } = await supabase
          .from('schedules')
          .select('id')
          .eq('teacher_id', teacher.id);
        
        const scheduleIds = teacherSchedules?.map(s => s.id) || [];
        if (scheduleIds.length === 0) return [];

        // Query only journals for this teacher's schedules
        const { data, error } = await supabase
          .from('teaching_journals')
          .select('*')
          .in('schedule_id', scheduleIds)
          .order('date', { ascending: false });
        
        if (error) throw error;
        if (!data) return [];
        
        // Fetch schedule details
        const journalsWithDetails = await Promise.all(
          data.map(async (journal) => {
            const { data: schedule } = await supabase
              .from('schedules')
              .select('subject, start_time, class_id, classes(name, grade)')
              .eq('id', journal.schedule_id)
              .single();
            
            return {
              ...journal,
              schedules: schedule
            };
          })
        );
        
        return journalsWithDetails;
      }
    },
    enabled: !!userRole && (userRole === 'admin' || !!user?.id),
  });

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
          toast({
            title: 'Tidak ada data absensi',
            description: 'Silakan isi absensi terlebih dahulu sebelum membuat jurnal.',
            variant: 'destructive'
          });
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
  }, [formData.schedule_id, formData.date, editingJournal, toast]);

  const resetForm = () => {
    setFormData({
      schedule_id: '',
      date: new Date().toISOString().split('T')[0],
      material: '',
      activity: '',
      students_present: 0,
      students_absent: 0,
      notes: '',
    });
    setEditingJournal(null);
    setHasAttendanceData(null);
    setIsCheckingAttendance(false);
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

  const handleEdit = (journal: any) => {
    setEditingJournal(journal);
    setFormData({
      schedule_id: journal.schedule_id,
      date: journal.date,
      material: journal.material,
      activity: journal.activity || '',
      students_present: journal.students_present || 0,
      students_absent: journal.students_absent || 0,
      notes: journal.notes || '',
    });
    setIsDialogOpen(true);
  };

  const getScheduleInfo = (journal: any) => {
    if (!journal?.schedules) return '-';
    const schedule = journal.schedules;
    const className = schedule.classes ? `${schedule.classes.name}` : '';
    return `${schedule.subject} - ${className} - ${schedule.start_time}`;
  };

  const getTeacherName = (journal: any) => {
    return journal?.teacher_name || '-';
  };

  const filteredJournals = journals?.filter((journal) => {
    const matchesDate = !filterDate || journal.date === filterDate;
    const matchesSchedule = filterSchedule === 'all' || journal.schedule_id === filterSchedule;
    return matchesDate && matchesSchedule;
  }).sort((a, b) => {
    if (sortBy === 'date') {
      const comparison = a.date.localeCompare(b.date);
      return sortOrder === 'asc' ? comparison : -comparison;
    } else {
      const scheduleA = getScheduleInfo(a);
      const scheduleB = getScheduleInfo(b);
      const comparison = scheduleA.localeCompare(scheduleB);
      return sortOrder === 'asc' ? comparison : -comparison;
    }
  }) || [];

  const toggleSort = (field: 'date' | 'schedule') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('school_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const handleExportPDF = async () => {
    if (!filteredJournals) return;

    const doc = new jsPDF();
    
    // Add letterhead
    const startY = await addLetterheadToPDF(doc, schoolSettings);
    
    // Report title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN JURNAL MENGAJAR', 105, startY, { align: 'center' });
    
    // Report info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, startY + 8);

    // Table data with teacher name for admin
    const tableData = filteredJournals.map((j, index) => {
      const baseData = [
        index + 1,
        j.date,
        getScheduleInfo(j),
        j.material,
        j.activity || '-',
        j.students_present || 0,
        j.students_absent || 0,
        j.notes || '-'
      ];
      
      if (userRole === 'admin') {
        return [index + 1, getTeacherName(j), ...baseData.slice(1)];
      }
      return baseData;
    });

    const headers = userRole === 'admin' 
      ? [['No', 'Guru', 'Tanggal', 'Jadwal', 'Materi', 'Aktivitas Pembelajaran', 'Hadir', 'Absen', 'Catatan']]
      : [['No', 'Tanggal', 'Jadwal', 'Materi', 'Aktivitas Pembelajaran', 'Hadir', 'Absen', 'Catatan']];

    autoTable(doc, {
      startY: startY + 16,
      head: headers,
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] },
      styles: { fontSize: 8 },
      columnStyles: userRole === 'admin' ? {
        0: { cellWidth: 10 },
        1: { cellWidth: 25 },
        2: { cellWidth: 18 },
        3: { cellWidth: 28 },
        4: { cellWidth: 30 },
        5: { cellWidth: 30 },
        6: { cellWidth: 12 },
        7: { cellWidth: 12 },
        8: { cellWidth: 25 }
      } : {
        0: { cellWidth: 10 },
        1: { cellWidth: 22 },
        2: { cellWidth: 32 },
        3: { cellWidth: 35 },
        4: { cellWidth: 30 },
        5: { cellWidth: 15 },
        6: { cellWidth: 15 },
        7: { cellWidth: 30 }
      }
    });

    // Save report data to database
    const finalY = (doc as any).lastAutoTable.finalY;
    const reportData = {
      verification: 'DOKUMEN VALID',
      type: 'Laporan Jurnal Mengajar',
      school: schoolSettings?.school_name,
      printDate: new Date().toISOString(),
      totalJournals: filteredJournals.length,
      dateRange: filterDate || 'Semua',
      journals: filteredJournals.map(j => ({
        tanggal: j.date,
        jadwal: `${j.schedules?.subject} - ${j.schedules?.classes?.name}`,
        materi: j.material,
        aktivitas: j.activity,
        siswaHadir: j.students_present,
        siswaAbsen: j.students_absent,
        catatan: j.notes
      }))
    };

    // Generate serial number and save to database
    const { data: serialData, error: serialError } = await supabase.rpc('generate_report_serial');
    if (serialError) {
      console.error('Error generating serial:', serialError);
      toast({ description: 'Gagal menggenerate nomor seri laporan', variant: 'destructive' });
      return;
    }
    
    const { error: insertError } = await supabase
      .from('verified_reports')
      .insert({
        serial_number: serialData,
        report_type: 'journal',
        report_data: reportData,
        created_by: user?.id
      });

    if (insertError) {
      console.error('Error saving report:', insertError);
      toast({ description: 'Gagal menyimpan data laporan untuk verifikasi', variant: 'destructive' });
      return;
    }

    // Add signature with serial number QR code
    await addSignatureToPDF(doc, schoolSettings, schoolSettings?.headmaster_name, schoolSettings?.headmaster_nip, finalY, serialData);

    doc.save(`jurnal-mengajar-${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ description: 'Laporan berhasil dicetak dengan QR code verifikasi' });
  };

  const handleExportCSV = () => {
    if (!filteredJournals) return;
    
    const csvContent = [
      ['Tanggal', 'Jadwal', 'Materi', 'Aktivitas Pembelajaran', 'Siswa Hadir', 'Siswa Absen', 'Catatan'].join(','),
      ...filteredJournals.map(j => [
        j.date,
        getScheduleInfo(j).replace(',', ' '),
        j.material.replace(',', ' '),
        (j.activity || '-').replace(',', ' '),
        j.students_present || 0,
        j.students_absent || 0,
        (j.notes || '-').replace(',', ' ')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jurnal-mengajar-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Jurnal Mengajar</h1>
            <p className="text-muted-foreground">
              {userRole === 'admin' ? 'Pantau jurnal mengajar semua guru' : 'Kelola jurnal mengajar Anda'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportPDF} className="gap-2">
              <FileText className="h-4 w-4" />
              PDF
            </Button>
            <Button variant="outline" onClick={handleExportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              CSV
            </Button>
            {userRole === 'teacher' && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}>
                    <Plus className="mr-2 h-4 w-4" />
                    Tambah Jurnal
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
                              <p className="text-sm font-semibold mb-1">⚠️ Belum ada data absensi</p>
                              <p className="text-xs">Silakan isi absensi untuk jadwal dan tanggal ini terlebih dahulu sebelum membuat jurnal mengajar.</p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2 border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                              onClick={() => {
                                setIsDialogOpen(false);
                                navigate('/attendance');
                              }}
                            >
                              Isi Absensi Sekarang
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : hasAttendanceData === true ? (
                          <div className="text-green-700">
                            <p className="text-sm font-semibold mb-1">✓ Data absensi tersedia</p>
                            <p className="text-xs">Jumlah kehadiran telah terisi otomatis dari data absensi.</p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Filter Tanggal</Label>
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  placeholder="Semua tanggal"
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
                        {schedule.subject} - {schedule.classes?.name || ''} - {schedule.start_time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  {userRole === 'admin' && <TableHead>Guru</TableHead>}
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => toggleSort('date')} className="gap-1">
                      Tanggal
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => toggleSort('schedule')} className="gap-1">
                      Jadwal
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>Materi</TableHead>
                  <TableHead>Kehadiran</TableHead>
                  {userRole === 'teacher' && <TableHead>Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJournals?.map((journal, index) => (
                  <TableRow key={journal.id}>
                    <TableCell>{index + 1}</TableCell>
                    {userRole === 'admin' && (
                      <TableCell className="font-medium">{getTeacherName(journal)}</TableCell>
                    )}
                    <TableCell>{journal.date}</TableCell>
                    <TableCell>{getScheduleInfo(journal)}</TableCell>
                    <TableCell className="max-w-xs truncate">{journal.material}</TableCell>
                    <TableCell>
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
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Journals;
