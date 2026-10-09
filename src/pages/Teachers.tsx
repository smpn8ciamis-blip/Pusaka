import { useState, useMemo } from 'react';
import { cleanPhoneNumber, isValidPhoneNumber } from '@/lib/phone';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Trash2, Pencil, ArrowUpDown } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { ImportTeachers } from '@/components/ImportTeachers';
import { HighlightText } from '@/components/HighlightText';


const teacherSchema = z.object({
  email: z.string().trim().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  fullName: z.string().trim().min(3, 'Nama minimal 3 karakter'),
  nip: z.string().trim().optional(),
  subject: z.string().trim().min(2, 'Mata pelajaran harus diisi'),
  role: z.enum(['admin', 'teacher']),
  isHomeroomTeacher: z.boolean().optional(),
});

function TeachersPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isHomeroomTeacher, setIsHomeroomTeacher] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<any>(null);
  const [editPhone, setEditPhone] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<'name' | 'email' | 'subject' | 'nip'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const itemsPerPage = 20;
  const queryClient = useQueryClient();

  // Fetch total count for pagination
  const { data: totalCount } = useQuery({
    queryKey: ['teachers-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('teachers')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: teachers, isLoading } = useQuery({
    queryKey: ['teachers', currentPage],
    queryFn: async () => {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      
      // Fetch profiles, roles, and homeroom class info
      const teachersWithDetails = await Promise.all(
        data.map(async (teacher) => {
          const [profileRes, roleRes, classRes] = await Promise.all([
            supabase.from('profiles').select('full_name, email, phone').eq('id', teacher.user_id).single(),
            supabase.from('user_roles').select('role').eq('user_id', teacher.user_id).single(),
            supabase.from('classes').select('id, name, grade, academic_year').eq('homeroom_teacher_id', teacher.id).maybeSingle()
          ]);
          return {
            ...teacher,
            profile: profileRes.data,
            user_role: roleRes.data,
            homeroom_class: classRes.data
          };
        })
      );
      
      return teachersWithDetails;
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, grade, academic_year, homeroom_teacher_id')
        .order('grade', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  const createTeacherMutation = useMutation({
    mutationFn: async (values: z.infer<typeof teacherSchema>) => {
      const { data, error } = await supabase.functions.invoke('create-teacher', {
        body: values
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['teachers-count'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success('Guru berhasil ditambahkan');
      setIsDialogOpen(false);
      setIsHomeroomTeacher(false);
    },
    onError: (error: any) => {
      toast.error('Gagal menambahkan guru: ' + error.message);
    },
  });

  const updateTeacherMutation = useMutation({
    mutationFn: async ({ teacherId, values, newClassId, oldClassId }: { teacherId: string; values: any; newClassId: string | null; oldClassId: string | null }) => {
      // Update teacher data
      const { error: teacherError } = await supabase
        .from('teachers')
        .update({
          nip: values.nip,
          subject: values.subject,
          pangkat_golongan: values.pangkat_golongan,
          jabatan: values.jabatan,
        })
        .eq('id', teacherId);

      if (teacherError) throw teacherError;

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: values.fullName,
          phone: values.phone || null,
        })
        .eq('id', values.userId);

      if (profileError) throw profileError;

      // Handle homeroom class changes
      if (oldClassId && oldClassId !== newClassId) {
        // Remove from old class
        const { error: removeError } = await supabase
          .from('classes')
          .update({ homeroom_teacher_id: null })
          .eq('id', oldClassId);
        
        if (removeError) throw removeError;
      }

      if (newClassId && newClassId !== oldClassId) {
        // Assign to new class
        const { error: assignError } = await supabase
          .from('classes')
          .update({ homeroom_teacher_id: teacherId })
          .eq('id', newClassId);
        
        if (assignError) throw assignError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['teachers-count'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success('Guru berhasil diperbarui');
      setIsDialogOpen(false);
      setEditingTeacher(null);
      setSelectedClassId('');
    },
    onError: (error: any) => {
      toast.error('Gagal memperbarui guru: ' + error.message);
    },
  });

  const deleteTeacherMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['teachers-count'] });
      toast.success('Guru berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error('Gagal menghapus guru: ' + error.message);
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      if (editingTeacher) {
        // Update existing teacher
        const phone = cleanPhoneNumber(editPhone);
        if (!isValidPhoneNumber(phone)) {
          toast.error('No. HP tidak valid (harus 9-15 digit angka).');
          return;
        }
        const values = {
          userId: editingTeacher.user_id,
          phone,
          fullName: formData.get('fullName') as string,
          nip: formData.get('nip') as string,
          subject: formData.get('subject') as string,
          pangkat_golongan: formData.get('pangkat_golongan') as string,
          jabatan: formData.get('jabatan') as string,
        };
        const newClassId = selectedClassId === 'none' ? null : selectedClassId || null;
        const oldClassId = editingTeacher.homeroom_class?.id || null;
        
        updateTeacherMutation.mutate({ 
          teacherId: editingTeacher.id, 
          values, 
          newClassId, 
          oldClassId 
        });
      } else {
        // Create new teacher
        const values = teacherSchema.parse({
          email: formData.get('email'),
          password: formData.get('password'),
          fullName: formData.get('fullName'),
          nip: formData.get('nip'),
          subject: formData.get('subject'),
          role: formData.get('role'),
          isHomeroomTeacher: isHomeroomTeacher,
        });
        
        createTeacherMutation.mutate(values);
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
      setIsHomeroomTeacher(false);
      setEditingTeacher(null);
      setEditPhone('');
      setSelectedClassId('none');
    }
  };

  const handleEditClick = (teacher: any) => {
    setEditingTeacher(teacher);
    setEditPhone(cleanPhoneNumber(teacher.profile?.phone || ''));
    setSelectedClassId(teacher.homeroom_class?.id || 'none');
    setIsDialogOpen(true);
  };

  // Sort and filter teachers
  const filteredAndSortedTeachers = useMemo(() => {
    if (!teachers) return [];
    
    // Filter by search term
    let filtered = teachers;
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = teachers.filter(teacher => 
        teacher.profile?.full_name?.toLowerCase().includes(search) ||
        teacher.profile?.email?.toLowerCase().includes(search) ||
        teacher.nip?.toLowerCase().includes(search) ||
        teacher.subject?.toLowerCase().includes(search)
      );
    }
    
    // Sort filtered results
    return [...filtered].sort((a, b) => {
      let compareA: any;
      let compareB: any;

      switch (sortField) {
        case 'name':
          compareA = a.profile?.full_name || '';
          compareB = b.profile?.full_name || '';
          break;
        case 'email':
          compareA = a.profile?.email || '';
          compareB = b.profile?.email || '';
          break;
        case 'nip':
          compareA = a.nip || '';
          compareB = b.nip || '';
          break;
        case 'subject':
          compareA = a.subject || '';
          compareB = b.subject || '';
          break;
        default:
          return 0;
      }

      if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [teachers, sortField, sortOrder, searchTerm]);

  const displayTeachers = filteredAndSortedTeachers;
  const totalPages = Math.ceil((totalCount || 0) / itemsPerPage);

  const handleSort = (field: 'name' | 'email' | 'subject' | 'nip') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Manajemen Guru</h1>
            <p className="text-muted-foreground">Kelola data guru dan hak akses</p>
          </div>
          <div className="flex gap-2">
            <ImportTeachers onSuccess={() => queryClient.invalidateQueries({ queryKey: ['teachers'] })} />
            <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Guru
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingTeacher ? 'Edit Guru' : 'Tambah Guru Baru'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nama Lengkap</Label>
                  <Input 
                    id="fullName" 
                    name="fullName" 
                    defaultValue={editingTeacher?.profile?.full_name}
                    required 
                  />
                </div>
                {editingTeacher && (
                  <div className="space-y-2">
                    <Label htmlFor="phone">No. HP / WhatsApp</Label>
                    <Input
                      id="phone"
                      name="phone"
                      inputMode="tel"
                      autoComplete="off"
                      placeholder="Contoh: 6281234567890"
                      value={editPhone}
                      onChange={(e) => setEditPhone(cleanPhoneNumber(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Dipakai untuk notifikasi WhatsApp. Tanda +, -, dan spasi dihapus otomatis saat ditempel.
                    </p>
                  </div>
                )}
                {!editingTeacher && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" name="password" type="password" required />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="nip">NIP (Opsional)</Label>
                  <Input 
                    id="nip" 
                    name="nip" 
                    defaultValue={editingTeacher?.nip}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pangkat_golongan">Pangkat/Golongan (Opsional)</Label>
                  <Input 
                    id="pangkat_golongan" 
                    name="pangkat_golongan" 
                    placeholder="Contoh: Pembina Tk.I IV/b"
                    defaultValue={editingTeacher?.pangkat_golongan}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jabatan">Jabatan (Opsional)</Label>
                  <Input 
                    id="jabatan" 
                    name="jabatan" 
                    placeholder="Contoh: Guru Madya"
                    defaultValue={editingTeacher?.jabatan}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Mata Pelajaran</Label>
                  <Select name="subject" defaultValue={editingTeacher?.subject} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih mata pelajaran" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Matematika">Matematika</SelectItem>
                      <SelectItem value="Bahasa Indonesia">Bahasa Indonesia</SelectItem>
                      <SelectItem value="Bahasa Inggris">Bahasa Inggris</SelectItem>
                      <SelectItem value="IPA">IPA (Ilmu Pengetahuan Alam)</SelectItem>
                      <SelectItem value="IPS">IPS (Ilmu Pengetahuan Sosial)</SelectItem>
                      <SelectItem value="Pendidikan Agama">Pendidikan Agama</SelectItem>
                      <SelectItem value="PKN">Pendidikan Kewarganegaraan (PKN)</SelectItem>
                      <SelectItem value="Seni Budaya">Seni Budaya</SelectItem>
                      <SelectItem value="PJOK">Pendidikan Jasmani (PJOK)</SelectItem>
                      <SelectItem value="Prakarya">Prakarya</SelectItem>
                      <SelectItem value="Fisika">Fisika</SelectItem>
                      <SelectItem value="Kimia">Kimia</SelectItem>
                      <SelectItem value="Biologi">Biologi</SelectItem>
                      <SelectItem value="Ekonomi">Ekonomi</SelectItem>
                      <SelectItem value="Geografi">Geografi</SelectItem>
                      <SelectItem value="Sejarah">Sejarah</SelectItem>
                      <SelectItem value="Sosiologi">Sosiologi</SelectItem>
                      <SelectItem value="Informatika">Informatika</SelectItem>
                      <SelectItem value="Bahasa Daerah">Bahasa Daerah</SelectItem>
                      <SelectItem value="Muatan Lokal">Muatan Lokal</SelectItem>
                      <SelectItem value="Bimbingan Konseling">Bimbingan Konseling (BK)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!editingTeacher && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Select name="role" defaultValue="teacher" required>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="teacher">Guru</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="isHomeroomTeacher" 
                        checked={isHomeroomTeacher}
                        onCheckedChange={(checked) => setIsHomeroomTeacher(checked as boolean)}
                      />
                      <Label htmlFor="isHomeroomTeacher" className="cursor-pointer font-normal">
                        Wali Kelas
                      </Label>
                    </div>
                  </>
                )}
                {editingTeacher && (
                  <div className="space-y-2">
                    <Label htmlFor="homeroomClass">Wali Kelas</Label>
                    <Select 
                      value={selectedClassId} 
                      onValueChange={setSelectedClassId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih kelas (opsional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Tidak menjadi wali kelas</SelectItem>
                        {classes?.map((cls) => {
                          const isOccupied = cls.homeroom_teacher_id && 
                                           cls.homeroom_teacher_id !== editingTeacher.id;
                          return (
                            <SelectItem 
                              key={cls.id} 
                              value={cls.id}
                              disabled={isOccupied}
                            >
                              {cls.name} - Kelas {cls.grade} ({cls.academic_year})
                              {isOccupied && ' - Sudah ada wali kelas'}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {selectedClassId && (
                      <p className="text-xs text-muted-foreground">
                        Guru ini akan menjadi wali kelas untuk rombel yang dipilih
                      </p>
                    )}
                  </div>
                )}
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={createTeacherMutation.isPending || updateTeacherMutation.isPending}
                >
                  {(createTeacherMutation.isPending || updateTeacherMutation.isPending) 
                    ? 'Menyimpan...' 
                    : editingTeacher ? 'Update' : 'Simpan'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari guru..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <p>Halaman {currentPage} dari {totalPages} - Menampilkan {displayTeachers.length} dari {totalCount || 0} guru</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
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
                  </Button>
                </div>
              </div>
              
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
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
                      onClick={() => handleSort('email')}
                      className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                    >
                      Email
                      <ArrowUpDown className={`h-4 w-4 ${sortField === 'email' ? 'text-primary' : ''}`} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('nip')}
                      className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                    >
                      NIP
                      <ArrowUpDown className={`h-4 w-4 ${sortField === 'nip' ? 'text-primary' : ''}`} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSort('subject')}
                      className="flex items-center gap-1 -ml-4 hover:bg-transparent"
                    >
                      Mata Pelajaran
                      <ArrowUpDown className={`h-4 w-4 ${sortField === 'subject' ? 'text-primary' : ''}`} />
                    </Button>
                  </TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Wali Kelas</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                  </TableRow>
                ) : !displayTeachers || displayTeachers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Tidak ada data guru
                    </TableCell>
                  </TableRow>
                ) : (
                  displayTeachers.map((teacher, index) => (
                    <TableRow key={teacher.id}>
                      <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                      <TableCell className="font-medium">
                        <HighlightText text={teacher.profile?.full_name || ''} searchTerm={searchTerm} />
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] break-words whitespace-normal text-sm">
                          <HighlightText text={teacher.profile?.email || ''} searchTerm={searchTerm} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <HighlightText text={teacher.nip || '-'} searchTerm={searchTerm} />
                      </TableCell>
                      <TableCell>
                        <HighlightText text={teacher.subject} searchTerm={searchTerm} />
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          teacher.user_role?.role === 'admin' 
                            ? 'bg-primary/10 text-primary' 
                            : 'bg-secondary/10 text-secondary'
                        }`}>
                          {teacher.user_role?.role === 'admin' ? 'Admin' : 'Guru'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {teacher.homeroom_class ? (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center rounded-full bg-accent/10 text-accent px-2 py-1 text-xs font-medium w-fit">
                              {teacher.homeroom_class.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Kelas {teacher.homeroom_class.grade} • {teacher.homeroom_class.academic_year}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditClick(teacher)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('Yakin ingin menghapus guru ini?')) {
                                deleteTeacherMutation.mutate(teacher.user_id);
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
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function Teachers() {
  return (
    <ProtectedRoute requireRole="admin">
      <TeachersPage />
    </ProtectedRoute>
  );
}
