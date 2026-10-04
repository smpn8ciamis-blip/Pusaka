import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ImportSchedulesProps {
  onSuccess?: () => void;
}

export const ImportSchedules = ({ onSuccess }: ImportSchedulesProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const downloadTemplate = () => {
    const template = [
      {
        'Hari (1-7)': '1',
        'Kelas': '7A',
        'Mata Pelajaran': 'Matematika',
        'Nama Guru': 'John Doe',
        'NIP Guru': '123456789',
        'Jam Mulai': '07:30',
        'Jam Selesai': '09:00',
        'Semester': '1',
        'Tahun Ajaran': '2024/2025'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 15 }
    ];

    XLSX.writeFile(wb, 'template-jadwal.xlsx');
    toast.success('Template berhasil diunduh');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        throw new Error('File Excel kosong');
      }

      const schedules = [];
      for (const row of jsonData) {
        // Find class by name
        const { data: classData } = await supabase
          .from('classes')
          .select('id')
          .eq('name', row['Kelas'])
          .maybeSingle();

        if (!classData) {
          toast.error(`Kelas "${row['Kelas']}" tidak ditemukan`);
          continue;
        }

        // Find teacher by NIP
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('id')
          .eq('nip', row['NIP Guru'])
          .maybeSingle();

        if (!teacherData) {
          toast.error(`Guru dengan NIP "${row['NIP Guru']}" tidak ditemukan`);
          continue;
        }

        schedules.push({
          day_of_week: parseInt(row['Hari (1-7)']),
          class_id: classData.id,
          subject: row['Mata Pelajaran'],
          start_time: row['Jam Mulai'],
          end_time: row['Jam Selesai'],
          teacher_id: teacherData.id,
          semester: parseInt(row['Semester']) || 1,
          academic_year: row['Tahun Ajaran']
        });
      }

      if (schedules.length === 0) {
        throw new Error('Tidak ada jadwal valid untuk diimport');
      }

      const { error } = await supabase.from('schedules').insert(schedules);
      if (error) throw error;

      toast.success(`${schedules.length} jadwal berhasil diimport`);
      setIsOpen(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error('Gagal import jadwal: ' + error.message);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Import Jadwal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Jadwal dari Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Download template Excel terlebih dahulu, isi data jadwal, lalu upload file.
            </p>
            <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2">
              <Download className="h-4 w-4" />
              Download Template
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Upload File Excel</p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={isProcessing}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            />
            {isProcessing && (
              <p className="text-sm text-muted-foreground">Memproses file...</p>
            )}
          </div>
          <div className="rounded-lg bg-muted p-3 space-y-1">
            <p className="text-xs font-medium">Catatan:</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Hari: 1=Senin, 2=Selasa, dst.</li>
              <li>Pastikan Kelas dan NIP Guru sudah ada di database</li>
              <li>Format waktu: HH:MM (contoh: 07:30)</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
