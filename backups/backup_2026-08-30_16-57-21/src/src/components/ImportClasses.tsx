import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ImportClassesProps {
  onSuccess?: () => void;
}

export const ImportClasses = ({ onSuccess }: ImportClassesProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const downloadTemplate = () => {
    const template = [
      {
        'Nama Rombel': '7A',
        'Tingkat': '7',
        'Tahun Ajaran': '2024/2025',
        'NIP Wali Kelas': '123456789'
      },
      {
        'Nama Rombel': '8B',
        'Tingkat': '8',
        'Tahun Ajaran': '2024/2025',
        'NIP Wali Kelas': '987654321'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 }
    ];

    XLSX.writeFile(wb, 'template-rombel.xlsx');
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

      const classes = [];
      for (const row of jsonData) {
        // Find homeroom teacher by NIP if provided
        let homeroomTeacherId = null;
        if (row['NIP Wali Kelas']) {
          const { data: teacherData } = await supabase
            .from('teachers')
            .select('id')
            .eq('nip', row['NIP Wali Kelas'])
            .maybeSingle();

          if (teacherData) {
            homeroomTeacherId = teacherData.id;
            
            // Update teacher to be homeroom teacher
            await supabase
              .from('teachers')
              .update({ is_homeroom_teacher: true })
              .eq('id', teacherData.id);
          }
        }

        classes.push({
          name: row['Nama Rombel'],
          grade: parseInt(row['Tingkat']),
          academic_year: row['Tahun Ajaran'],
          homeroom_teacher_id: homeroomTeacherId
        });
      }

      if (classes.length === 0) {
        throw new Error('Tidak ada rombel valid untuk diimport');
      }

      const { error } = await supabase.from('classes').insert(classes);
      if (error) throw error;

      toast.success(`${classes.length} rombel berhasil diimport`);
      setIsOpen(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error('Gagal import rombel: ' + error.message);
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
          Import Rombel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Rombel dari Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Download template Excel terlebih dahulu, isi data rombel, lalu upload file.
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
              <li>Tingkat: 7, 8, 9 untuk SMP</li>
              <li>NIP Wali Kelas opsional, kosongkan jika belum ada</li>
              <li>Pastikan guru dengan NIP tersebut sudah terdaftar</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
