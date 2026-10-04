import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ImportClasses } from '@/components/ImportClasses';
import { useAcademicYear } from '@/contexts/AcademicYearContext';

function ClassesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<any>(null);
  const queryClient = useQueryClient();
  const { selectedYear } = useAcademicYear();

  const { data: teachers } = useQuery({
    queryKey: ['teachers-for-homeroom'],
    queryFn: async () => {
      const { data, error } = await supabase.from('teachers').select('id, user_id').order('created_at');
      if (error) throw error;
      
      const teachersWithProfiles = await Promise.all(
        data.map(async (teacher) => {
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', teacher.user_id).single();
          return { ...teacher, profile };
        })
      );
      return teachersWithProfiles;
    },
  });

  const { data: classes, isLoading } = useQuery({
    queryKey: ['classes', selectedYear],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('academic_year', selectedYear)
        .order('grade')
        .order('name');
      if (error) throw error;
      
      const classesWithTeachers = await Promise.all(
        data.map(async (cls) => {
          if (!cls.homeroom_teacher_id) return { ...cls, teacher_name: null };
          const { data: teacher } = await supabase.from('teachers').select('user_id').eq('id', cls.homeroom_teacher_id).single();
          if (!teacher) return { ...cls, teacher_name: null };
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', teacher.user_id).single();
          return { ...cls, teacher_name: profile?.full_name };
        })
      );
      return classesWithTeachers;
    },
  });

  const createClassMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const homeroomTeacherId = formData.get('homeroomTeacherId') as string;
      const { error } = await supabase.from('classes').insert({
        name: formData.get('name') as string,
        grade: parseInt(formData.get('grade') as string),
        homeroom_teacher_id: homeroomTeacherId || null,
        academic_year: formData.get('academicYear') as string,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success('Kelas berhasil ditambahkan');
      setIsDialogOpen(false);
      setEditingClass(null);
    },
    onError: (error: any) => {
      toast.error('Gagal menambahkan kelas: ' + error.message);
    },
  });

  const updateClassMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: FormData }) => {
      const homeroomTeacherId = formData.get('homeroomTeacherId') as string;
      const { error } = await supabase.from('classes').update({
        name: formData.get('name') as string,
        grade: parseInt(formData.get('grade') as string),
        homeroom_teacher_id: homeroomTeacherId || null,
        academic_year: formData.get('academicYear') as string,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success('Kelas berhasil diperbarui');
      setIsDialogOpen(false);
      setEditingClass(null);
    },
    onError: (error: any) => {
      toast.error('Gagal memperbarui kelas: ' + error.message);
    },
  });

  const deleteClassMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success('Kelas berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error('Gagal menghapus kelas: ' + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (editingClass) {
      updateClassMutation.mutate({ id: editingClass.id, formData });
    } else {
      createClassMutation.mutate(formData);
    }
  };

  const handleEdit = (cls: any) => {
    setEditingClass(cls);
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingClass(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Manajemen Kelas</h1>
            <p className="text-muted-foreground">Kelola data kelas dan wali kelas</p>
          </div>
          <div className="flex gap-2">
            <ImportClasses onSuccess={() => queryClient.invalidateQueries({ queryKey: ['classes'] })} />
            <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Kelas
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingClass ? 'Edit Kelas' : 'Tambah Kelas Baru'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Kelas *</Label>
                  <Input 
                    id="name" 
                    name="name" 
                    placeholder="contoh: 7A" 
                    defaultValue={editingClass?.name}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grade">Tingkat *</Label>
                  <Select name="grade" defaultValue={editingClass?.grade?.toString()} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih tingkat" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Kelas 7</SelectItem>
                      <SelectItem value="8">Kelas 8</SelectItem>
                      <SelectItem value="9">Kelas 9</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="academicYear">Tahun Ajaran *</Label>
                  <Input 
                    id="academicYear" 
                    name="academicYear" 
                    placeholder="2024/2025" 
                    defaultValue={editingClass?.academic_year}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="homeroomTeacherId">Wali Kelas</Label>
                  <Select name="homeroomTeacherId" defaultValue={editingClass?.homeroom_teacher_id || ''}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih wali kelas" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers?.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.profile?.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={createClassMutation.isPending || updateClassMutation.isPending}>
                  {(createClassMutation.isPending || updateClassMutation.isPending) ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>Nama Kelas</TableHead>
                  <TableHead>Tingkat</TableHead>
                  <TableHead>Wali Kelas</TableHead>
                  <TableHead>Tahun Ajaran</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">Loading...</TableCell>
                  </TableRow>
                ) : classes?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Tidak ada data kelas
                    </TableCell>
                  </TableRow>
                ) : (
                  classes?.map((cls, index) => (
                    <TableRow key={cls.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{cls.name}</TableCell>
                      <TableCell>Kelas {cls.grade}</TableCell>
                      <TableCell>{cls.teacher_name || '-'}</TableCell>
                      <TableCell>{cls.academic_year}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(cls)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('Yakin ingin menghapus kelas ini?')) {
                                deleteClassMutation.mutate(cls.id);
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
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function Classes() {
  return (
    <ProtectedRoute requireRole="admin">
      <ClassesPage />
    </ProtectedRoute>
  );
}
