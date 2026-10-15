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

/** "9B_2026/2027" -> "B"; "VIII-C 2025/2026" -> "C" (bagian rombel tanpa tingkat & tahun ajaran) */
const classSection = (name: string): string =>
  String(name ?? '')
    .replace(/[\s_-]*\d{4}\s*[/-]\s*\d{4}\s*$/, '')
    .trim()
    .replace(/^(?:\d+|[IVX]+)[\s._-]*/i, '')
    .trim()
    .toUpperCase();

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
        .eq('status', 'aktif')
        .eq('is_alumni', false)
        .order('full_name');
      if (error) throw error;
      return data;
    },
    enabled: !!sourceClassId,
  });

  const promoteMutation = useMutation({
    mutationFn: async () => {
      const sourceClass = classes?.find(c => c.id === sourceClassId);
      const isGraduating = sourceClass?.grade === 9;
      if (selectedStudents.length === 0 || (!isGraduating && !targetClassId)) {
        throw new Error('Pilih siswa dan kelas tujuan');
      }
      const today = new Date().toISOString().split('T')[0];
      const patch = isGraduating
        ? { class_id: null, is_alumni: true, graduation_date: today }   // sama dengan menu Luluskan Siswa
        : { class_id: targetClassId };
      // hanya siswa aktif & bukan alumni yang diproses
      const { data, error } = await supabase
        .from('students')
        .update(patch)
        .in('id', selectedStudents)
        .eq('status', 'aktif')
        .eq('is_alumni', false)
        .select('id');
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-for-promotion'] });
      queryClient.invalidateQueries({ queryKey: ['promotion-active-counts'] });
      const sourceClass = classes?.find(c => c.id === sourceClassId);
      const isGraduating = sourceClass?.grade === 9;
      toast.success(
        isGraduating
          ? `${n} siswa berhasil lulus dan ditandai sebagai alumni`
          : `${n} siswa berhasil naik kelas`
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

  // Jumlah siswa aktif per kelas tahun aktif (untuk pratinjau kenaikan massal)
  const { data: activeCounts } = useQuery({
    queryKey: ['promotion-active-counts', activeYear?.year],
    enabled: isOpen && !!activeYear?.year && hasNewYear && !!classes,
    queryFn: async () => {
      const ids = (classes ?? []).filter(c => c.academic_year === activeYear!.year).map(c => c.id);
      const counts = new Map<string, number>();
      for (let from = 0; ids.length > 0; from += 1000) {
        const { data, error } = await supabase
          .from('students').select('class_id')
          .in('class_id', ids).eq('status', 'aktif').eq('is_alumni', false)
          .range(from, from + 999);
        if (error) throw error;
        (data ?? []).forEach(r => counts.set(r.class_id as string, (counts.get(r.class_id as string) ?? 0) + 1));
        if (!data || data.length < 1000) break;
      }
      return counts;
    },
  });

  // Rencana kenaikan massal: tiap kelas aktif -> kelas tahun baru (tingkat+1, rombel sama) / lulus
  const plan = (classes ?? [])
    .filter(c => c.academic_year === activeYear?.year)
    .map(c => {
      const count = activeCounts?.get(c.id) ?? 0;
      if (c.grade === 9) return { cls: c, count, kind: 'lulus' as const, target: null };
      const cand = (classes ?? []).filter(t =>
        t.academic_year === newYear && t.grade === c.grade + 1 && classSection(t.name) === classSection(c.name));
      return { cls: c, count, kind: cand.length === 1 ? ('naik' as const) : ('tidak-cocok' as const), target: cand.length === 1 ? cand[0] : null, ambiguous: cand.length > 1 };
    })
    .filter(p => p.count > 0)
    .sort((a, b) => a.cls.grade - b.cls.grade || a.cls.name.localeCompare(b.cls.name, 'id', { numeric: true }));
  const unmatched = plan.filter(p => p.kind === 'tidak-cocok');

  const promoteAllMutation = useMutation({
    mutationFn: async () => {
      if (!activeYear?.year || !newYear) {
        throw new Error('Tahun ajaran tidak valid');
      }
      const today = new Date().toISOString().split('T')[0];
      let totalPromoted = 0;
      let totalGraduated = 0;
      const failed: string[] = [];

      for (const item of plan) {
        if (item.kind === 'tidak-cocok') continue; // dilaporkan di pratinjau; siswa dibiarkan di kelas asal
        const patch = item.kind === 'lulus'
          ? { class_id: null, is_alumni: true, graduation_date: today }
          : { class_id: item.target!.id };
        const { data, error } = await supabase
          .from('students')
          .update(patch)
          .eq('class_id', item.cls.id)
          .eq('status', 'aktif')        // siswa mutasi/keluar tidak ikut dinaikkan
          .eq('is_alumni', false)
          .select('id');
        if (error) { failed.push(`${item.cls.name}: ${error.message}`); continue; }
        if (item.kind === 'lulus') totalGraduated += data?.length ?? 0;
        else totalPromoted += data?.length ?? 0;
      }
      return { totalPromoted, totalGraduated, failed, skipped: unmatched.reduce((a, p) => a + p.count, 0) };
    },
    onSuccess: ({ totalPromoted, totalGraduated, failed, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-for-promotion'] });
      queryClient.invalidateQueries({ queryKey: ['promotion-active-counts'] });

      const messages = [];
      if (totalPromoted > 0) messages.push(`${totalPromoted} siswa naik kelas`);
      if (totalGraduated > 0) messages.push(`${totalGraduated} siswa lulus sebagai alumni`);
      toast.success(messages.join(' dan ') || 'Tidak ada siswa yang diproses');
      if (skipped > 0) toast.warning(`${skipped} siswa tidak diproses karena kelas tujuan tidak ditemukan. Buat kelas tahun ${newYear} lalu ulangi.`);
      if (failed.length > 0) toast.error(`Sebagian kelas gagal diproses: ${failed.join('; ')}`);
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
                      <p>Hanya siswa <strong>aktif</strong> yang diproses (siswa mutasi/keluar tidak ikut).</p>
                      <div className="max-h-52 overflow-y-auto rounded-md border text-xs">
                        {plan.length === 0 ? (
                          <p className="p-2 text-muted-foreground">Tidak ada siswa aktif di kelas tahun {activeYear?.year}.</p>
                        ) : plan.map((p) => (
                          <div key={p.cls.id} className="flex items-center justify-between gap-2 border-b px-2 py-1.5 last:border-b-0">
                            <span className="font-medium">{p.cls.name} <span className="text-muted-foreground">({p.count})</span></span>
                            <span className={p.kind === 'tidak-cocok' ? 'text-destructive' : 'text-muted-foreground'}>
                              {p.kind === 'lulus' ? 'Lulus (alumni)' : p.kind === 'naik' ? `→ ${p.target!.name}` : (p as any).ambiguous ? 'Kelas tujuan ganda' : 'Kelas tujuan tidak ada'}
                            </span>
                          </div>
                        ))}
                      </div>
                      {unmatched.length > 0 && (
                        <p className="text-destructive text-xs">
                          {unmatched.reduce((a, p) => a + p.count, 0)} siswa di {unmatched.length} kelas TIDAK akan diproses karena kelas tujuan belum ada di tahun {newYear}.
                        </p>
                      )}
                      <p className="font-semibold">Apakah Anda yakin ingin melanjutkan?</p>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={promoteAllMutation.isPending}>
                      Batalkan
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => promoteAllMutation.mutate()}
                      disabled={promoteAllMutation.isPending || plan.length === 0 || plan.every(p => p.kind === 'tidak-cocok')}
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

              {sourceClass?.grade === 9 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Siswa kelas 9 yang dipilih akan <strong>lulus</strong> dan ditandai sebagai alumni (tanpa kelas tujuan).</AlertDescription>
                </Alert>
              ) : (
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
              )}

                <Button
                  onClick={() => promoteMutation.mutate()}
                  disabled={promoteMutation.isPending || selectedStudents.length === 0 || (sourceClass?.grade !== 9 && !targetClassId)}
                  className="w-full"
                >
                  {promoteMutation.isPending ? 'Memproses...' : sourceClass?.grade === 9 ? `Luluskan ${selectedStudents.length} Siswa` : `Naikkan ${selectedStudents.length} Siswa ke Tahun Ajaran ${newYear}`}
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
