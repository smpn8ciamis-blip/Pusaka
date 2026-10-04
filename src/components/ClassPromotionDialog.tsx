import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowUpCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const ClassPromotionDialog = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [sourceClassId, setSourceClassId] = useState<string>('');
  const [targetClassId, setTargetClassId] = useState<string>('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: academicYears } = useQuery({
    queryKey: ['academic-years-for-promotion'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .order('year');
      if (error) throw error;
      return data;
    },
  });

  const activeYear = academicYears?.find(y => y.is_active);
  const availableYears = academicYears?.map(y => y.year).sort() || [];
  const currentYearIndex = availableYears.indexOf(activeYear?.year || '');
  const hasNewYear = currentYearIndex < availableYears.length - 1;
  const newYear = hasNewYear ? availableYears[currentYearIndex + 1] : null;

  const { data: classes } = useQuery({
    queryKey: ['classes-for-promotion'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('grade')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['students-for-promotion', sourceClassId],
    queryFn: async () => {
      if (!sourceClassId) return [];
      const { data, error } = await supabase
        .from('students')
        .select('id, nis, full_name')
        .eq('class_id', sourceClassId)
        .order('full_name');
      if (error) throw error;
      return data;
    },
    enabled: !!sourceClassId,
  });

  const promoteMutation = useMutation({
    mutationFn: async () => {
      if (selectedStudents.length === 0 || !targetClassId) {
        throw new Error('Pilih siswa dan kelas tujuan');
      }
      
      // Check if source class is grade 9 (graduating students)
      const sourceClass = classes?.find(c => c.id === sourceClassId);
      const isGraduating = sourceClass?.grade === 9;
      
      if (isGraduating) {
        // Mark grade 9 students as alumni with graduation date
        const { error } = await supabase
          .from('students')
          .update({ 
            class_id: targetClassId,
            is_alumni: true,
            graduation_date: new Date().toISOString().split('T')[0]
          })
          .in('id', selectedStudents);
        
        if (error) throw error;
      } else {
        // Regular promotion for other grades
        const { error } = await supabase
          .from('students')
          .update({ class_id: targetClassId })
          .in('id', selectedStudents);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      const sourceClass = classes?.find(c => c.id === sourceClassId);
      const isGraduating = sourceClass?.grade === 9;
      toast.success(
        isGraduating 
          ? `${selectedStudents.length} siswa berhasil lulus dan ditandai sebagai alumni`
          : `${selectedStudents.length} siswa berhasil naik kelas`
      );
      setIsOpen(false);
      setSourceClassId('');
      setTargetClassId('');
      setSelectedStudents([]);
    },
    onError: (error: any) => {
      toast.error('Gagal menaikkan kelas: ' + error.message);
    },
  });

  const promoteAllMutation = useMutation({
    mutationFn: async () => {
      if (!activeYear?.year || !newYear) {
        throw new Error('Tahun ajaran tidak valid');
      }

      let totalPromoted = 0;
      let totalGraduated = 0;

      // Get all classes from active year
      const activeClasses = classes?.filter(c => c.academic_year === activeYear.year) || [];
      
      for (const sourceClass of activeClasses) {
        // Get all students in this class
        const { data: studentsInClass, error: studentsError } = await supabase
          .from('students')
          .select('id')
          .eq('class_id', sourceClass.id);

        if (studentsError || !studentsInClass || studentsInClass.length === 0) continue;

        const studentIds = studentsInClass.map(s => s.id);

        if (sourceClass.grade === 9) {
          // Grade 9 students become alumni
          const { error } = await supabase
            .from('students')
            .update({ 
              class_id: null,
              is_alumni: true,
              graduation_date: new Date().toISOString().split('T')[0]
            })
            .in('id', studentIds);

          if (!error) {
            totalGraduated += studentIds.length;
          }
        } else {
          // Find target class in new year (same grade + 1)
          const targetGrade = sourceClass.grade + 1;
          const targetClass = classes?.find(c => 
            c.academic_year === newYear && 
            c.grade === targetGrade &&
            c.name.includes(sourceClass.name.replace(/\d+/, String(targetGrade)))
          );

          if (targetClass) {
            const { error } = await supabase
              .from('students')
              .update({ class_id: targetClass.id })
              .in('id', studentIds);

            if (!error) {
              totalPromoted += studentIds.length;
            }
          }
        }
      }

      return { totalPromoted, totalGraduated };
    },
    onSuccess: ({ totalPromoted, totalGraduated }) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-for-promotion'] });
      
      const messages = [];
      if (totalPromoted > 0) messages.push(`${totalPromoted} siswa naik kelas`);
      if (totalGraduated > 0) messages.push(`${totalGraduated} siswa lulus sebagai alumni`);
      
      toast.success(messages.join(' dan '));
      setShowConfirmDialog(false);
      setIsOpen(false);
      setSourceClassId('');
      setTargetClassId('');
      setSelectedStudents([]);
    },
    onError: (error: any) => {
      toast.error('Gagal menaikkan semua siswa: ' + error.message);
      setShowConfirmDialog(false);
    },
  });

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAll = () => {
    if (students && selectedStudents.length === students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(students?.map(s => s.id) || []);
    }
  };

  const sourceClass = classes?.find(c => c.id === sourceClassId);
  const sourceClasses = classes?.filter(c => c.academic_year === activeYear?.year);
  const targetClasses = classes?.filter(c => 
    c.academic_year === newYear && 
    c.grade === (sourceClass?.grade || 0) + 1
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!hasNewYear}>
          <ArrowUpCircle className="mr-2 h-4 w-4" />
          Naik Kelas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Naik Kelas Peserta Didik</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!hasNewYear ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Fitur naik kelas hanya tersedia setelah tahun pelajaran baru dibuat. 
                Tahun aktif saat ini: <strong>{activeYear?.year}</strong>
                <br />
                Silakan buat tahun pelajaran baru di menu Pengaturan Tahun Ajaran.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Siswa akan dipindahkan dari tahun ajaran <strong>{activeYear?.year}</strong> ke <strong>{newYear}</strong>
                </AlertDescription>
              </Alert>

              <div className="flex gap-2 mb-4">
                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={promoteAllMutation.isPending}
                  className="flex-1"
                  variant="default"
                >
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  Naikan Semua Siswa
                </Button>
              </div>

              <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      Konfirmasi Naik Kelas Massal
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <p>
                        Anda akan menaikkan <strong>SEMUA SISWA</strong> dari tahun ajaran{' '}
                        <strong>{activeYear?.year}</strong> ke tahun ajaran <strong>{newYear}</strong>.
                      </p>
                      <p className="text-yellow-600 font-medium">
                        ⚠️ Siswa kelas 9 akan otomatis ditandai sebagai alumni dan lulus.
                      </p>
                      <p>Operasi ini akan memproses seluruh siswa di semua kelas secara otomatis.</p>
                      <p className="font-semibold">Apakah Anda yakin ingin melanjutkan?</p>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={promoteAllMutation.isPending}>
                      Batalkan
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => promoteAllMutation.mutate()}
                      disabled={promoteAllMutation.isPending}
                      className="bg-primary"
                    >
                      {promoteAllMutation.isPending ? 'Memproses...' : 'Ya, Naikkan Semua Siswa'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Atau pilih kelas tertentu
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Kelas Asal (Tahun Ajaran {activeYear?.year})</Label>
                <Select value={sourceClassId} onValueChange={setSourceClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kelas asal" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceClasses?.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        Kelas {cls.grade} - {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

          {sourceClassId && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Pilih Siswa ({selectedStudents.length} dipilih)</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    {selectedStudents.length === students?.length ? 'Batalkan Semua' : 'Pilih Semua'}
                  </Button>
                </div>
                <ScrollArea className="h-[200px] border rounded-md p-4">
                  {studentsLoading ? (
                    <p className="text-sm text-muted-foreground">Memuat siswa...</p>
                  ) : students?.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Tidak ada siswa di kelas ini</p>
                  ) : (
                    <div className="space-y-2">
                      {students?.map((student) => (
                        <div key={student.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={student.id}
                            checked={selectedStudents.includes(student.id)}
                            onCheckedChange={() => handleToggleStudent(student.id)}
                          />
                          <label
                            htmlFor={student.id}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {student.nis} - {student.full_name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <div className="space-y-2">
                <Label>Kelas Tujuan (Tahun Ajaran {newYear})</Label>
                <Select value={targetClassId} onValueChange={setTargetClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kelas tujuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {!sourceClassId ? (
                      <div className="p-2 text-sm text-muted-foreground">
                        Pilih kelas asal terlebih dahulu
                      </div>
                    ) : targetClasses?.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">
                        Belum ada kelas tingkat {(sourceClass?.grade || 0) + 1} untuk tahun ajaran {newYear}
                      </div>
                    ) : (
                      targetClasses?.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          Kelas {cls.grade} - {cls.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

                <Button
                  onClick={() => promoteMutation.mutate()}
                  disabled={promoteMutation.isPending || selectedStudents.length === 0 || !targetClassId}
                  className="w-full"
                >
                  {promoteMutation.isPending ? 'Memproses...' : `Naikkan ${selectedStudents.length} Siswa ke Tahun Ajaran ${newYear}`}
                </Button>
              </>
            )}
          </>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
