import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Copy, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CopySchedulesDialogProps {
  availableYears: Array<{ id: string; year: string; is_active: boolean }>;
  activeYear: string;
  onSuccess: () => void;
}

export const CopySchedulesDialog = ({ availableYears, activeYear, onSuccess }: CopySchedulesDialogProps) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedSourceYear, setSelectedSourceYear] = useState('');
  const [copyResult, setCopyResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const handleCopy = async () => {
    if (!selectedSourceYear) {
      toast({ title: 'Pilih tahun ajaran sumber', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    setCopyResult(null);

    try {
      // Fetch schedules from source year
      const { data: sourceSchedules, error: fetchError } = await supabase
        .from('schedules')
        .select('*')
        .eq('academic_year', selectedSourceYear);

      if (fetchError) throw fetchError;

      if (!sourceSchedules || sourceSchedules.length === 0) {
        toast({ 
          title: 'Tidak ada jadwal', 
          description: 'Tidak ada jadwal di tahun ajaran yang dipilih',
          variant: 'destructive' 
        });
        setIsProcessing(false);
        return;
      }

      // Get all classes and teachers in the active year to verify they exist
      const { data: activeClasses } = await supabase
        .from('classes')
        .select('id')
        .eq('academic_year', activeYear);

      const { data: activeTeachers } = await supabase
        .from('teachers')
        .select('id');

      const activeClassIds = new Set(activeClasses?.map(c => c.id) || []);
      const activeTeacherIds = new Set(activeTeachers?.map(t => t.id) || []);

      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      // Copy each schedule
      for (const schedule of sourceSchedules) {
        // Check if class and teacher exist
        if (!activeClassIds.has(schedule.class_id)) {
          failedCount++;
          errors.push(`Kelas tidak ditemukan untuk mata pelajaran ${schedule.subject}`);
          continue;
        }

        if (!activeTeacherIds.has(schedule.teacher_id)) {
          failedCount++;
          errors.push(`Guru tidak ditemukan untuk mata pelajaran ${schedule.subject}`);
          continue;
        }

        // Check if schedule already exists in active year
        const { data: existingSchedule } = await supabase
          .from('schedules')
          .select('id')
          .eq('academic_year', activeYear)
          .eq('class_id', schedule.class_id)
          .eq('teacher_id', schedule.teacher_id)
          .eq('subject', schedule.subject)
          .eq('day_of_week', schedule.day_of_week)
          .eq('start_time', schedule.start_time)
          .maybeSingle();

        if (existingSchedule) {
          failedCount++;
          errors.push(`Jadwal ${schedule.subject} sudah ada`);
          continue;
        }

        // Insert new schedule
        const { error: insertError } = await supabase
          .from('schedules')
          .insert({
            class_id: schedule.class_id,
            teacher_id: schedule.teacher_id,
            subject: schedule.subject,
            day_of_week: schedule.day_of_week,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            semester: schedule.semester,
            academic_year: activeYear,
          });

        if (insertError) {
          failedCount++;
          errors.push(`Gagal menyalin ${schedule.subject}: ${insertError.message}`);
        } else {
          successCount++;
        }
      }

      setCopyResult({ success: successCount, failed: failedCount, errors });

      if (successCount > 0) {
        toast({ 
          title: 'Berhasil menyalin jadwal', 
          description: `${successCount} jadwal berhasil disalin` 
        });
        onSuccess();
      }

      if (failedCount > 0) {
        toast({ 
          title: 'Beberapa jadwal gagal disalin', 
          description: `${failedCount} jadwal gagal disalin`,
          variant: 'destructive' 
        });
      }

    } catch (error: any) {
      toast({ 
        title: 'Gagal menyalin jadwal', 
        description: error.message,
        variant: 'destructive' 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const previousYears = availableYears.filter(y => !y.is_active && y.year !== activeYear);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Copy className="mr-2 h-4 w-4" />
          Salin dari Tahun Lalu
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Salin Jadwal dari Tahun Ajaran Sebelumnya</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              Fitur ini akan menyalin semua jadwal dari tahun ajaran yang dipilih ke tahun ajaran aktif ({activeYear}).
              Hanya jadwal dengan kelas dan guru yang masih ada yang akan disalin.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Tahun Ajaran Sumber</Label>
            <Select value={selectedSourceYear} onValueChange={setSelectedSourceYear}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih tahun ajaran" />
              </SelectTrigger>
              <SelectContent>
                {previousYears.map((year) => (
                  <SelectItem key={year.id} value={year.year}>
                    {year.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {copyResult && (
            <div className="space-y-2">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">Hasil Penyalinan:</p>
                <p className="text-sm text-green-600">✓ Berhasil: {copyResult.success} jadwal</p>
                <p className="text-sm text-red-600">✗ Gagal: {copyResult.failed} jadwal</p>
              </div>

              {copyResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto">
                  <p className="text-sm font-medium mb-2">Detail Error:</p>
                  <ul className="text-sm space-y-1">
                    {copyResult.errors.slice(0, 10).map((error, index) => (
                      <li key={index} className="text-destructive">• {error}</li>
                    ))}
                    {copyResult.errors.length > 10 && (
                      <li className="text-muted-foreground">... dan {copyResult.errors.length - 10} error lainnya</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isProcessing}>
              Tutup
            </Button>
            <Button onClick={handleCopy} disabled={isProcessing || !selectedSourceYear}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyalin...
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Salin Jadwal
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
