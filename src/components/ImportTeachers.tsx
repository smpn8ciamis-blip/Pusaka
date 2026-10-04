import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ImportTeachersProps {
  onSuccess?: () => void;
}

export const ImportTeachers = ({ onSuccess }: ImportTeachersProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const downloadTemplate = () => {
    const template = [
      {
        'Email': 'guru1@sekolah.com',
        'Password': 'password123',
        'Nama Lengkap': 'Nama Guru 1',
        'NIP': '123456789',
        'Mata Pelajaran': 'Matematika',
        'Pangkat/Golongan': 'Penata / III/c',
        'Jabatan': 'Guru',
        'Role (admin/teacher)': 'teacher',
        'Wali Kelas (Ya/Tidak)': 'Ya'
      },
      {
        'Email': 'guru2@sekolah.com',
        'Password': 'password123',
        'Nama Lengkap': 'Nama Guru 2',
        'NIP': '987654321',
        'Mata Pelajaran': 'Bahasa Indonesia',
        'Pangkat/Golongan': 'Pembina / IV/a',
        'Jabatan': 'Wakil Kepala Sekolah',
        'Role (admin/teacher)': 'teacher',
        'Wali Kelas (Ya/Tidak)': 'Tidak'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 25 },  // Email
      { wch: 15 },  // Password
      { wch: 25 },  // Nama Lengkap
      { wch: 15 },  // NIP
      { wch: 20 },  // Mata Pelajaran
      { wch: 20 },  // Pangkat/Golongan
      { wch: 25 },  // Jabatan
      { wch: 20 },  // Role
      { wch: 20 }   // Wali Kelas
    ];

    XLSX.writeFile(wb, 'template-guru.xlsx');
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

      const teachers = [];
      for (const row of jsonData) {
        const isHomeroomTeacher = row['Wali Kelas (Ya/Tidak)']?.toLowerCase() === 'ya';
        
        teachers.push({
          email: row['Email'],
          password: String(row['Password']),
          fullName: row['Nama Lengkap'],
          nip: row['NIP'] ? String(row['NIP']) : null,
          subject: row['Mata Pelajaran'],
          pangkatGolongan: row['Pangkat/Golongan'] ? String(row['Pangkat/Golongan']) : null,
          jabatan: row['Jabatan'] ? String(row['Jabatan']) : null,
          role: row['Role (admin/teacher)'] || 'teacher',
          isHomeroomTeacher: isHomeroomTeacher
        });
      }

      if (teachers.length === 0) {
        throw new Error('Tidak ada guru valid untuk diimport');
      }

      let successCount = 0;
      let errorCount = 0;

      for (const teacher of teachers) {
        try {
          const { error } = await supabase.functions.invoke('create-teacher', {
            body: teacher
          });
          
          if (error) {
            errorCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          errorCount++;
        }
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      toast.success(`Import selesai. Berhasil: ${successCount}, Gagal: ${errorCount}`);
      
      if (successCount > 0) {
        setIsOpen(false);
        onSuccess?.();
      }
    } catch (error: any) {
      toast.error('Gagal import guru: ' + error.message);
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
          Import Guru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Guru dari Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Download template Excel terlebih dahulu, isi data guru, lalu upload file.
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
              <li>Email harus unik dan valid</li>
              <li>Password minimal 6 karakter</li>
              <li>Role: admin atau teacher</li>
              <li>Wali Kelas: Ya atau Tidak</li>
              <li>Pangkat/Golongan dan Jabatan opsional</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
