import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Trash2, Upload, Pencil, ArrowUpDown, ChevronLeft, ChevronRight, Users, Download, FileSpreadsheet, Filter, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { ImportStudents } from '@/components/ImportStudents';
import { ClassPromotionDialog } from '@/components/ClassPromotionDialog';
import { GraduateStudentsDialog } from '@/components/GraduateStudentsDialog';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { HighlightText } from '@/components/HighlightText';


const studentSchema = z.object({
  nis: z.string().trim().min(1, 'NIS harus diisi'),
  nisn: z.string().trim().optional(),
  fullName: z.string().trim().min(3, 'Nama minimal 3 karakter'),
  classId: z.string().optional(),
  gender: z.enum(['L', 'P'], { errorMap: () => ({ message: 'Pilih jenis kelamin' }) }),
  birthDate: z.string().optional(),
  birthPlace: z.string().trim().optional(),
  address: z.string().trim().optional(),
  parentName: z.string().trim().optional(),
  parentPhone: z.string().trim().optional(),
});

function StudentsPage() {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [sortField, setSortField] = useState<'nis' | 'name' | 'class' | 'gender'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const itemsPerPage = 50;
  const queryClient = useQueryClient();

  // Advanced filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filterClass, setFilterClass] = useState<string>('');
  const [filterGender, setFilterGender] = useState<string>('');
  const [filterAlumniStatus, setFilterAlumniStatus] = useState<string>('');
  const [filterGraduationDateFrom, setFilterGraduationDateFrom] = useState('');
  const [filterGraduationDateTo, setFilterGraduationDateTo] = useState('');

  // Reset to page 1 when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterClass, filterGender, filterAlumniStatus, filterGraduationDateFrom, filterGraduationDateTo]);

  // Function to convert name to Title Case
  const toTitleCase = (name: string): string => {
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch total count for pagination with filters
  const { data: totalCount } = useQuery({
    queryKey: ['students-count', searchTerm, filterClass, filterGender, filterAlumniStatus, filterGraduationDateFrom, filterGraduationDateTo],
    queryFn: async () => {
      let query = supabase
        .from('students')
        .select('*', { count: 'exact', head: true });

      // Apply search filter
      if (searchTerm.trim()) {
        query = query.or(`full_name.ilike.%${searchTerm}%,nis.ilike.%${searchTerm}%,nisn.ilike.%${searchTerm}%`);
      }

      // Apply class filter
      if (filterClass) {
        query = query.eq('class_id', filterClass);
      }

      // Apply gender filter
      if (filterGender) {
        query = query.eq('gender', filterGender);
      }

      // Apply alumni status filter
      if (filterAlumniStatus === 'alumni') {
        query = query.eq('is_alumni', true);
      } else if (filterAlumniStatus === 'active') {
        query = query.or('is_alumni.is.null,is_alumni.eq.false');
      }

      // Apply graduation date filters
      if (filterGraduationDateFrom) {
        query = query.gte('graduation_date', filterGraduationDateFrom);
      }
      if (filterGraduationDateTo) {
        query = query.lte('graduation_date', filterGraduationDateTo);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: students, isLoading } = useQuery({
    queryKey: ['students', currentPage, searchTerm, filterClass, filterGender, filterAlumniStatus, filterGraduationDateFrom, filterGraduationDateTo, sortField, sortOrder],
    queryFn: async () => {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      let query = supabase
        .from('students')
        .select(`
          *,
          classes (
            name
          )
        `);

      // Apply search filter
      if (searchTerm.trim()) {
        query = query.or(`full_name.ilike.%${searchTerm}%,nis.ilike.%${searchTerm}%,nisn.ilike.%${searchTerm}%`);
      }

      // Apply class filter
      if (filterClass) {
        query = query.eq('class_id', filterClass);
      }

      // Apply gender filter
      if (filterGender) {
        query = query.eq('gender', filterGender);
      }

      // Apply alumni status filter
      if (filterAlumniStatus === 'alumni') {
        query = query.eq('is_alumni', true);
      } else if (filterAlumniStatus === 'active') {
        query = query.or('is_alumni.is.null,is_alumni.eq.false');
      }

      // Apply graduation date filters
      if (filterGraduationDateFrom) {
        query = query.gte('graduation_date', filterGraduationDateFrom);
      }
      if (filterGraduationDateTo) {
        query = query.lte('graduation_date', filterGraduationDateTo);
      }

      // Apply sorting
      const orderColumn = sortField === 'name' ? 'full_name' : 
                         sortField === 'class' ? 'classes.name' : 
                         sortField;
      query = query.order(orderColumn, { ascending: sortOrder === 'asc' });

      // Apply pagination
      query = query.range(from, to);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });

  const createStudentMutation = useMutation({
    mutationFn: async (values: z.infer<typeof studentSchema> & { photoUrl?: string }) => {
      const { error } = await supabase.from('students').insert({
        nis: values.nis,
        nisn: values.nisn || null,
        full_name: values.fullName,
        class_id: values.classId || null,
        gender: values.gender,
        birth_date: values.birthDate || null,
        birth_place: values.birthPlace || null,
        address: values.address || null,
        parent_name: values.parentName || null,
        parent_phone: values.parentPhone || null,
        photo_url: values.photoUrl || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-count'] });
      toast.success('Siswa berhasil ditambahkan');
      setIsDialogOpen(false);
      setEditingStudent(null);
      setPhotoFile(null);
    },
    onError: (error: any) => {
      toast.error('Gagal menambahkan siswa: ' + error.message);
    },
  });

  const updateStudentMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: z.infer<typeof studentSchema> & { photoUrl?: string | null } }) => {
      const updateData: any = {
        nis: values.nis,
        nisn: values.nisn || null,
        full_name: values.fullName,
        class_id: values.classId || null,
        gender: values.gender,
        birth_date: values.birthDate || null,
        birth_place: values.birthPlace || null,
        address: values.address || null,
        parent_name: values.parentName || null,
        parent_phone: values.parentPhone || null,
      };
      
      // Only update photo_url if a new photo was uploaded
      if (values.photoUrl !== undefined) {
        updateData.photo_url = values.photoUrl;
      }
      
      const { error } = await supabase
        .from('students')
        .update(updateData)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-count'] });
      toast.success('Siswa berhasil diperbarui');
      setIsDialogOpen(false);
      setEditingStudent(null);
      setPhotoFile(null);
    },
    onError: (error: any) => {
      toast.error('Gagal memperbarui siswa: ' + error.message);
    },
  });

  const deleteStudentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-count'] });
      toast.success('Siswa berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error('Gagal menghapus siswa: ' + error.message);
    },
  });

  const importStudentsMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('File CSV kosong atau tidak valid');
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredHeaders = ['nis', 'nama'];
      
      if (!requiredHeaders.every(h => headers.includes(h))) {
        throw new Error('Format tidak valid. Header minimal: NIS, Nama');
      }

      let insertedCount = 0;
      let updatedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < 2) continue;

        const nisIndex = headers.indexOf('nis');
        const nisnIndex = headers.indexOf('nisn');
        const namaIndex = headers.indexOf('nama');
        const kelasIndex = headers.indexOf('kelas');
        const genderIndex = headers.indexOf('jenis kelamin');
        const birthPlaceIndex = headers.indexOf('tempat lahir');
        const birthDateIndex = headers.indexOf('tanggal lahir');
        const addressIndex = headers.indexOf('alamat');
        const parentNameIndex = headers.indexOf('nama orang tua');
        const parentPhoneIndex = headers.indexOf('no hp orang tua');

        const nis = values[nisIndex];
        if (!nis) {
          errorCount++;
          errors.push(`Baris ${i + 1}: NIS kosong`);
          continue;
        }

        // Find class by name if provided
        let classId = null;
        if (kelasIndex >= 0 && values[kelasIndex]) {
          const className = values[kelasIndex];
          const { data: classData } = await supabase
            .from('classes')
            .select('id')
            .eq('name', className)
            .maybeSingle();
          classId = classData?.id || null;
        }

        const studentData = {
          nis: nis,
          nisn: nisnIndex >= 0 ? values[nisnIndex] || null : null,
          full_name: values[namaIndex],
          class_id: classId,
          gender: genderIndex >= 0 ? values[genderIndex] : null,
          birth_place: birthPlaceIndex >= 0 ? values[birthPlaceIndex] || null : null,
          birth_date: birthDateIndex >= 0 ? values[birthDateIndex] || null : null,
          address: addressIndex >= 0 ? values[addressIndex] || null : null,
          parent_name: parentNameIndex >= 0 ? values[parentNameIndex] || null : null,
          parent_phone: parentPhoneIndex >= 0 ? values[parentPhoneIndex] || null : null,
        };

        // Check if student with this NIS already exists
        const { data: existingStudent } = await supabase
          .from('students')
          .select('id')
          .eq('nis', nis)
          .maybeSingle();

        if (existingStudent) {
          // Update existing student
          const { error } = await supabase
            .from('students')
            .update(studentData)
            .eq('id', existingStudent.id);
          
          if (error) {
            errorCount++;
            errors.push(`Baris ${i + 1} (${nis}): ${error.message}`);
          } else {
            updatedCount++;
          }
        } else {
          // Insert new student
          const { error } = await supabase
            .from('students')
            .insert(studentData);
          
          if (error) {
            errorCount++;
            errors.push(`Baris ${i + 1} (${nis}): ${error.message}`);
          } else {
            insertedCount++;
          }
        }
      }

      return { insertedCount, updatedCount, errorCount, errors };
    },
    onSuccess: ({ insertedCount, updatedCount, errorCount, errors }) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      
      const messages = [];
      if (insertedCount > 0) messages.push(`${insertedCount} siswa ditambahkan`);
      if (updatedCount > 0) messages.push(`${updatedCount} siswa diperbarui`);
      if (errorCount > 0) messages.push(`${errorCount} gagal`);
      
      const message = messages.join(', ');
      
      if (errorCount > 0 && errors.length > 0) {
        toast.error(`${message}. Error: ${errors.slice(0, 3).join('; ')}`);
      } else {
        toast.success(`Import selesai: ${message}`);
      }
      
      setIsImportDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error('Gagal import siswa: ' + error.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const values = studentSchema.parse({
        nis: formData.get('nis'),
        nisn: formData.get('nisn'),
        fullName: formData.get('fullName'),
        classId: formData.get('classId'),
        gender: formData.get('gender'),
        birthDate: formData.get('birthDate'),
        birthPlace: formData.get('birthPlace'),
        address: formData.get('address'),
        parentName: formData.get('parentName'),
        parentPhone: formData.get('parentPhone'),
      });
      
      let photoUrl: string | null | undefined = undefined;
      
      // Upload photo if selected
      if (photoFile) {
        setIsUploadingPhoto(true);
        try {
          const fileExt = photoFile.name.split('.').pop();
          const fileName = `student-${values.nis}-${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('school-logos')
            .upload(fileName, photoFile, { upsert: true });
          
          if (uploadError) throw uploadError;
          
          const { data: urlData } = supabase.storage
            .from('school-logos')
            .getPublicUrl(fileName);
          
          photoUrl = urlData.publicUrl;
        } catch (error) {
          console.error('Error uploading photo:', error);
          toast.error('Gagal mengunggah foto siswa');
        } finally {
          setIsUploadingPhoto(false);
        }
      }
      
      if (editingStudent) {
        // Update existing student
        updateStudentMutation.mutate({ id: editingStudent.id, values: { ...values, photoUrl } });
      } else {
        // Create new student
        createStudentMutation.mutate({ ...values, photoUrl: photoUrl || null });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingStudent(null);
      setPhotoFile(null);
    }
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ classId }: { classId: string }) => {
      if (selectedStudentIds.length === 0) {
        throw new Error('Pilih siswa terlebih dahulu');
      }
      
      const { error } = await supabase
        .from('students')
        .update({ class_id: classId })
        .in('id', selectedStudentIds);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-count'] });
      toast.success(`${selectedStudentIds.length} siswa berhasil diperbarui`);
      setIsBulkEditOpen(false);
      setSelectedStudentIds([]);
    },
    onError: (error: any) => {
      toast.error('Gagal memperbarui siswa: ' + error.message);
    },
  });

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAll = () => {
    if (selectedStudentIds.length === displayStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(displayStudents.map(s => s.id));
    }
  };

  const handleBulkSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const classId = formData.get('classId') as string;
    
    if (!classId) {
      toast.error('Pilih kelas tujuan');
      return;
    }
    
    bulkUpdateMutation.mutate({ classId });
  };

  const handleExportStudents = () => {
    if (!students || students.length === 0) {
      toast.error('Tidak ada data siswa untuk diekspor');
      return;
    }

    // Prepare data for export
    const exportData = students.map(student => ({
      'NIS': student.nis,
      'NISN': student.nisn || '',
      'Nama': student.full_name,
      'Kelas': student.classes?.name || '',
      'Jenis Kelamin': student.gender === 'L' ? 'L' : student.gender === 'P' ? 'P' : '',
      'Tempat Lahir': student.birth_place || '',
      'Tanggal Lahir': student.birth_date || '',
      'Alamat': student.address || '',
      'Nama Orang Tua': student.parent_name || '',
      'No HP Orang Tua': student.parent_phone || '',
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    const columnWidths = [
      { wch: 15 }, // NIS
      { wch: 15 }, // NISN
      { wch: 30 }, // Nama
      { wch: 10 }, // Kelas
      { wch: 15 }, // Jenis Kelamin
      { wch: 20 }, // Tempat Lahir
      { wch: 15 }, // Tanggal Lahir
      { wch: 30 }, // Alamat
      { wch: 25 }, // Nama Orang Tua
      { wch: 15 }, // No HP Orang Tua
    ];
    ws['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `data-siswa-${timestamp}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);
    
    toast.success(`Data ${students.length} siswa berhasil diekspor`);
  };

  const handleDownloadTemplate = () => {
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Instruction sheet
    const instructionData = [
      ['TEMPLATE IMPORT DATA SISWA'],
      [''],
      ['PETUNJUK PENGGUNAAN:'],
      ['1. Isi data siswa pada sheet "Data Siswa"'],
      ['2. Kolom yang wajib diisi: NIS, Nama, Jenis Kelamin'],
      ['3. Format Jenis Kelamin: L (Laki-laki) atau P (Perempuan)'],
      ['4. Format Tanggal Lahir: YYYY-MM-DD (contoh: 2010-05-15)'],
      ['5. Nama Kelas harus sesuai dengan kelas yang ada di sistem'],
      ['6. Simpan file sebagai CSV atau Excel'],
      ['7. Import melalui tombol Import di halaman Manajemen Siswa'],
      [''],
      ['CONTOH DATA SISWA ADA DI SHEET "Data Siswa"'],
      [''],
      ['CATATAN PENTING:'],
      ['- Jangan ubah nama kolom header'],
      ['- Pastikan NIS unik untuk setiap siswa'],
      ['- Data yang kosong akan diabaikan saat import'],
    ];
    
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructionData);
    wsInstructions['!cols'] = [{ wch: 60 }];
    
    // Style for instruction sheet title
    if (wsInstructions['A1']) {
      wsInstructions['A1'].s = {
        font: { bold: true, sz: 14 },
        alignment: { horizontal: 'center' }
      };
    }
    
    // Get available classes for reference
    const classNames = classes?.map(c => c.name).join(', ') || 'Tidak ada kelas';
    
    // Sample data sheet with examples
    const sampleData = [
      {
        'NIS': '2024001',
        'NISN': '0051234567',
        'Nama': 'Ahmad Rizki Pratama',
        'Kelas': classes?.[0]?.name || '7A',
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Jakarta',
        'Tanggal Lahir': '2010-05-15',
        'Alamat': 'Jl. Merdeka No. 123, Jakarta',
        'Nama Orang Tua': 'Budi Pratama',
        'No HP Orang Tua': '081234567890',
      },
      {
        'NIS': '2024002',
        'NISN': '0051234568',
        'Nama': 'Siti Nurhaliza',
        'Kelas': classes?.[0]?.name || '7A',
        'Jenis Kelamin': 'P',
        'Tempat Lahir': 'Bandung',
        'Tanggal Lahir': '2010-08-20',
        'Alamat': 'Jl. Sudirman No. 456, Bandung',
        'Nama Orang Tua': 'Suharto',
        'No HP Orang Tua': '081234567891',
      },
      {
        'NIS': '2024003',
        'NISN': '0051234569',
        'Nama': 'Muhammad Fajar',
        'Kelas': classes?.[1]?.name || '7B',
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Surabaya',
        'Tanggal Lahir': '2010-12-10',
        'Alamat': 'Jl. Pahlawan No. 789, Surabaya',
        'Nama Orang Tua': 'Joko Susanto',
        'No HP Orang Tua': '081234567892',
      },
    ];
    
    const wsData = XLSX.utils.json_to_sheet(sampleData);
    
    // Set column widths
    const columnWidths = [
      { wch: 15 }, // NIS
      { wch: 15 }, // NISN
      { wch: 30 }, // Nama
      { wch: 12 }, // Kelas
      { wch: 15 }, // Jenis Kelamin
      { wch: 20 }, // Tempat Lahir
      { wch: 15 }, // Tanggal Lahir
      { wch: 35 }, // Alamat
      { wch: 25 }, // Nama Orang Tua
      { wch: 15 }, // No HP Orang Tua
    ];
    wsData['!cols'] = columnWidths;
    
    // Add reference sheet with available classes
    const referenceData = [
      ['DAFTAR KELAS TERSEDIA'],
      [''],
      ['Gunakan nama kelas di bawah ini untuk kolom "Kelas":'],
      [''],
      ...classes?.map(c => [c.name, `Kelas ${c.grade}`, c.academic_year]) || [['Tidak ada kelas', '', '']],
      [''],
      ['Format: Nama Kelas | Tingkat | Tahun Ajaran'],
    ];
    
    const wsReference = XLSX.utils.aoa_to_sheet(referenceData);
    wsReference['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }];
    
    // Add sheets to workbook
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Petunjuk');
    XLSX.utils.book_append_sheet(wb, wsData, 'Data Siswa');
    XLSX.utils.book_append_sheet(wb, wsReference, 'Referensi Kelas');
    
    // Download file
    const filename = 'template-import-siswa.xlsx';
    XLSX.writeFile(wb, filename);
    
    toast.success('Template berhasil diunduh. Silakan isi data dan import kembali.');
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Ukuran foto maksimal 2MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('File harus berupa gambar');
        return;
      }
      setPhotoFile(file);
    }
  };

  // Students are already filtered and sorted from the database query
  const displayStudents = students || [];

  const totalPages = Math.ceil((totalCount || 0) / itemsPerPage);

  const handleSort = (field: 'nis' | 'name' | 'class' | 'gender') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    // Reset to first page when sorting changes
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilterClass('');
    setFilterGender('');
    setFilterAlumniStatus('');
    setFilterGraduationDateFrom('');
    setFilterGraduationDateTo('');
    setSearchTerm('');
    setCurrentPage(1);
    toast.success('Filter direset');
  };

  const hasActiveFilters = filterClass || filterGender || filterAlumniStatus || filterGraduationDateFrom || filterGraduationDateTo;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Manajemen Siswa</h1>
            <p className="text-muted-foreground">Kelola data siswa</p>
          </div>
          <div className="flex gap-2">
            {selectedStudentIds.length > 0 && (
              <Button variant="secondary" onClick={() => setIsBulkEditOpen(true)}>
                <Users className="mr-2 h-4 w-4" />
                Pindah Kelas ({selectedStudentIds.length})
              </Button>
            )}
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Template
            </Button>
            <Button variant="outline" onClick={handleExportStudents}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <ClassPromotionDialog />
            <GraduateStudentsDialog />
            <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Siswa
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingStudent ? 'Edit Siswa' : 'Tambah Siswa Baru'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nis">NIS *</Label>
                      <Input id="nis" name="nis" defaultValue={editingStudent?.nis} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nisn">NISN</Label>
                      <Input id="nisn" name="nisn" defaultValue={editingStudent?.nisn} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="fullName">Nama Lengkap *</Label>
                      <Input id="fullName" name="fullName" defaultValue={editingStudent?.full_name} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="classId">Kelas</Label>
                      <Select name="classId" defaultValue={editingStudent?.class_id || ''}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih kelas" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes?.map((cls) => (
                            <SelectItem key={cls.id} value={cls.id}>
                              {cls.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">Jenis Kelamin *</Label>
                      <Select name="gender" defaultValue={editingStudent?.gender} required>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="L">Laki-laki</SelectItem>
                          <SelectItem value="P">Perempuan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="birthPlace">Tempat Lahir</Label>
                      <Input id="birthPlace" name="birthPlace" defaultValue={editingStudent?.birth_place} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="birthDate">Tanggal Lahir</Label>
                      <Input id="birthDate" name="birthDate" type="date" defaultValue={editingStudent?.birth_date} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="address">Alamat</Label>
                      <Input id="address" name="address" defaultValue={editingStudent?.address} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="parentName">Nama Orang Tua</Label>
                      <Input id="parentName" name="parentName" defaultValue={editingStudent?.parent_name} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="parentPhone">No. HP Orang Tua</Label>
                      <Input id="parentPhone" name="parentPhone" type="tel" defaultValue={editingStudent?.parent_phone} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="photo">Foto Siswa</Label>
                      <Input 
                        id="photo" 
                        type="file" 
                        accept="image/*"
                        onChange={handlePhotoChange}
                        disabled={isUploadingPhoto}
                      />
                      <p className="text-xs text-muted-foreground">
                        Format: JPG, PNG (Maksimal 2MB) - Foto akan ditampilkan di kartu ujian
                      </p>
                      {photoFile && (
                        <p className="text-xs text-green-600">
                          File terpilih: {photoFile.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={createStudentMutation.isPending || updateStudentMutation.isPending || isUploadingPhoto}>
                    {createStudentMutation.isPending || updateStudentMutation.isPending || isUploadingPhoto ? 'Menyimpan...' : editingStudent ? 'Perbarui' : 'Simpan'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pindah Kelas ({selectedStudentIds.length} Siswa)</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bulkClassId">Pindahkan ke Kelas</Label>
                <Select name="classId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kelas tujuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes?.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsBulkEditOpen(false)}
                  className="flex-1"
                >
                  Batal
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={bulkUpdateMutation.isPending}
                >
                  {bulkUpdateMutation.isPending ? 'Memproses...' : 'Perbarui'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari siswa..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant={showFilters ? "default" : "outline"}
                  size="icon"
                  onClick={() => setShowFilters(!showFilters)}
                  title="Filter Lanjutan"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </div>

              {/* Advanced Filters */}
              {showFilters && (
                <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">Filter Lanjutan</h3>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetFilters}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reset
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Kelas</Label>
                      <Select value={filterClass} onValueChange={setFilterClass}>
                        <SelectTrigger>
                          <SelectValue placeholder="Semua Kelas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Semua Kelas</SelectItem>
                          {classes?.map((cls) => (
                            <SelectItem key={cls.id} value={cls.id}>
                              {cls.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Jenis Kelamin</Label>
                      <Select value={filterGender} onValueChange={setFilterGender}>
                        <SelectTrigger>
                          <SelectValue placeholder="Semua" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Semua</SelectItem>
                          <SelectItem value="L">Laki-laki</SelectItem>
                          <SelectItem value="P">Perempuan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={filterAlumniStatus} onValueChange={setFilterAlumniStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="Semua Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Semua Status</SelectItem>
                          <SelectItem value="active">Siswa Aktif</SelectItem>
                          <SelectItem value="alumni">Alumni</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Tanggal Kelulusan (Dari)</Label>
                      <Input
                        type="date"
                        value={filterGraduationDateFrom}
                        onChange={(e) => setFilterGraduationDateFrom(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tanggal Kelulusan (Sampai)</Label>
                      <Input
                        type="date"
                        value={filterGraduationDateTo}
                        onChange={(e) => setFilterGraduationDateTo(e.target.value)}
                      />
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground">
                        Menampilkan {totalCount || 0} siswa yang sesuai filter
                      </p>
                    </div>
                  )}
                </div>
              )}

              {selectedStudentIds.length > 0 && (
                <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                  <span className="text-sm font-medium">
                    {selectedStudentIds.length} siswa dipilih
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedStudentIds([])}
                  >
                    Batalkan Pilihan
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <p>Halaman {currentPage} dari {totalPages} - Menampilkan {displayStudents.length} dari {totalCount || 0} siswa</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <span className="text-sm">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                  <TableHead className="w-12">
                      <Checkbox
                        checked={displayStudents.length > 0 && selectedStudentIds.length === displayStudents.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('nis')}
                        className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                      >
                        NIS
                        <ArrowUpDown className={`h-4 w-4 ${sortField === 'nis' ? 'text-primary' : ''}`} />
                      </Button>
                    </TableHead>
                    <TableHead>NISN</TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                      >
                        Nama
                        <ArrowUpDown className={`h-4 w-4 ${sortField === 'name' ? 'text-primary' : ''}`} />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('class')}
                        className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                      >
                        Kelas
                        <ArrowUpDown className={`h-4 w-4 ${sortField === 'class' ? 'text-primary' : ''}`} />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleSort('gender')}
                        className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                      >
                        Jenis Kelamin
                        <ArrowUpDown className={`h-4 w-4 ${sortField === 'gender' ? 'text-primary' : ''}`} />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : displayStudents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Tidak ada data siswa
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayStudents.map((student, index) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedStudentIds.includes(student.id)}
                            onCheckedChange={() => handleToggleStudent(student.id)}
                          />
                        </TableCell>
                        <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                        <TableCell className="font-medium">
                          <HighlightText text={student.nis} searchTerm={searchTerm} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <HighlightText text={student.nisn || '-'} searchTerm={searchTerm} />
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => navigate(`/students/${student.id}`)}
                            className="text-primary hover:underline font-medium text-left"
                          >
                            <HighlightText text={toTitleCase(student.full_name)} searchTerm={searchTerm} />
                          </button>
                        </TableCell>
                        <TableCell>
                          <HighlightText text={student.classes?.name || '-'} searchTerm={searchTerm} />
                        </TableCell>
                        <TableCell>{student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingStudent(student);
                                setIsDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm('Yakin ingin menghapus siswa ini?')) {
                                  deleteStudentMutation.mutate(student.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Halaman {currentPage} dari {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Sebelumnya
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="gap-1"
                    >
                      Selanjutnya
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <ImportStudents />
      </div>
    </DashboardLayout>
  );
}

export default function Students() {
  return (
    <ProtectedRoute requireRole="admin">
      <StudentsPage />
    </ProtectedRoute>
  );
}
