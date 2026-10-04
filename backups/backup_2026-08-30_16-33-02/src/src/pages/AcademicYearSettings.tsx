import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AcademicYear {
  id: string;
  year: string;
  is_active: boolean;
  created_at: string;
}

const AcademicYearSettings = () => {
  const [newYear, setNewYear] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: academicYears = [], isLoading } = useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .order('year', { ascending: false });

      if (error) throw error;
      return data as AcademicYear[];
    },
  });

  const addYearMutation = useMutation({
    mutationFn: async (year: string) => {
      const { error } = await supabase
        .from('academic_years')
        .insert({ year, is_active: academicYears.length === 0 });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      setNewYear('');
      toast.success('Tahun pelajaran berhasil ditambahkan');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menambahkan tahun pelajaran');
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('academic_years')
        .update({ is_active: true })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      toast.success('Tahun pelajaran aktif berhasil diubah');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal mengubah tahun pelajaran aktif');
    },
  });

  const deleteYearMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('academic_years')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      toast.success('Tahun pelajaran berhasil dihapus');
      setDeleteId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menghapus tahun pelajaran');
      setDeleteId(null);
    },
  });

  const handleAddYear = () => {
    if (!newYear.trim()) {
      toast.error('Mohon isi tahun pelajaran');
      return;
    }

    // Validate format (e.g., 2024/2025)
    if (!/^\d{4}\/\d{4}$/.test(newYear)) {
      toast.error('Format tahun pelajaran harus seperti: 2024/2025');
      return;
    }

    addYearMutation.mutate(newYear);
  };

  const handleSetActive = (id: string) => {
    setActiveMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteYearMutation.mutate(deleteId);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Pengaturan Tahun Pelajaran</h1>
          <p className="text-muted-foreground mt-2">
            Kelola tahun pelajaran dan tentukan tahun pelajaran aktif
          </p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tambah Tahun Pelajaran Baru</CardTitle>
              <CardDescription>
                Format: YYYY/YYYY (contoh: 2024/2025)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="2024/2025"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddYear()}
                />
                <Button onClick={handleAddYear} disabled={addYearMutation.isPending}>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daftar Tahun Pelajaran</CardTitle>
              <CardDescription>
                Klik ikon untuk mengaktifkan tahun pelajaran
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center text-muted-foreground py-8">Memuat...</p>
              ) : academicYears.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Belum ada tahun pelajaran
                </p>
              ) : (
                <div className="space-y-2">
                  {academicYears.map((year) => (
                    <div
                      key={year.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetActive(year.id)}
                          disabled={year.is_active || setActiveMutation.isPending}
                        >
                          {year.is_active ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </Button>
                        <div>
                          <p className="font-medium">{year.year}</p>
                          {year.is_active && (
                            <p className="text-sm text-primary">Tahun Aktif</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(year.id)}
                        disabled={year.is_active}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Tahun Pelajaran</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus tahun pelajaran ini? Data yang terkait
              dengan tahun pelajaran ini tidak akan terhapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AcademicYearSettings;