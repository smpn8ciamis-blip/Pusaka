import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Download, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export function ImportStudents() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('classes').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const handleDownloadTemplate = () => {
    // Create template data
    const template = [
      {
        'NIS': '2024001',
        'NISN': '0012345678',
        'Nama Lengkap': 'Contoh Nama Siswa',
        'Rombel': '7A',
        'Jenis Kelamin': 'L',
        'Tempat Lahir': 'Jakarta',
        'Tanggal Lahir': '2010-01-15',
        'Alamat': 'Jl. Contoh No. 123',
        'Nama Orang Tua': 'Nama Orang Tua',
        'No. HP Orang Tua': '081234567890'
      }
    ];

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // NIS
      { wch: 15 }, // NISN
      { wch: 25 }, // Nama Lengkap
      { wch: 10 }, // Rombel
      { wch: 15 }, // Jenis Kelamin
      { wch: 20 }, // Tempat Lahir
      { wch: 15 }, // Tanggal Lahir
      { wch: 40 }, // Alamat
      { wch: 25 }, // Nama Orang Tua
      { wch: 18 }  // No. HP Orang Tua
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');

    // Save file
    XLSX.writeFile(wb, 'Template_Import_Siswa.xlsx');
    toast.success('Template berhasil diunduh');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        toast.error('File harus berformat Excel (.xlsx atau .xls)');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error('Pilih file terlebih dahulu');
      return;
    }

    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          if (jsonData.length === 0) {
            toast.error('File Excel kosong');
            return;
          }

          // Validate and transform data
          const students = jsonData.map((row: any) => {
            const nis = row['NIS']?.toString().trim();
            const nisn = row['NISN']?.toString().trim();
            const fullName = row['Nama Lengkap']?.toString().trim();
            const rombelName = row['Rombel']?.toString().trim();
            const gender = row['Jenis Kelamin']?.toString().trim().toUpperCase();
            const birthPlace = row['Tempat Lahir']?.toString().trim();
            const birthDate = row['Tanggal Lahir'];
            const address = row['Alamat']?.toString().trim();
            const parentName = row['Nama Orang Tua']?.toString().trim();
            const parentPhone = row['No. HP Orang Tua']?.toString().trim();

            // Validate required fields
            if (!nis || !fullName) {
              throw new Error(`Data tidak lengkap pada baris dengan NIS: ${nis || 'kosong'}`);
            }

            // Validate gender
            if (gender && gender !== 'L' && gender !== 'P') {
              throw new Error(`Jenis kelamin tidak valid untuk ${fullName}. Gunakan L atau P`);
            }

            // Validate required fields - Rombel is now required
            if (!nis || !fullName || !rombelName) {
              throw new Error(`Data tidak lengkap pada baris dengan NIS: ${nis || 'kosong'}`);
            }

            // Parse date
            let parsedDate = null;
            if (birthDate) {
              if (typeof birthDate === 'number') {
                // Excel serial date
                const date = XLSX.SSF.parse_date_code(birthDate);
                parsedDate = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
              } else if (typeof birthDate === 'string') {
                parsedDate = birthDate;
              }
            }

            // Look up class by rombel name
            const targetClass = classes?.find(cls => cls.name === rombelName);
            if (!targetClass) {
              throw new Error(`Kelas "${rombelName}" tidak ditemukan untuk siswa ${fullName}. Pastikan rombel sudah dibuat terlebih dahulu.`);
            }

            return {
              nis,
              nisn: nisn || null,
              full_name: fullName,
              gender: gender || null,
              birth_place: birthPlace || null,
              birth_date: parsedDate,
              address: address || null,
              parent_name: parentName || null,
              parent_phone: parentPhone || null,
              class_id: targetClass.id
            };
          });

          // Insert data
          const { error } = await supabase
            .from('students')
            .insert(students);

          if (error) throw error;

          toast.success(`Berhasil mengimport ${students.length} siswa`);
          queryClient.invalidateQueries({ queryKey: ['students'] });
          setIsDialogOpen(false);
          setSelectedFile(null);
        } catch (error: any) {
          console.error('Import error:', error);
          toast.error(`Gagal import: ${error.message}`);
        }
      };

      reader.readAsBinaryString(selectedFile);
    } catch (error: any) {
      console.error('File reading error:', error);
      toast.error(`Gagal membaca file: ${error.message}`);
    }
  };

  return (
    <Card className="card-hover border-none shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Import Data Siswa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Import data siswa dari file Excel secara massal
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
            <Download className="h-4 w-4" />
            Download Template
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-gradient-primary">
                <Upload className="h-4 w-4" />
                Import Data
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Data Siswa dari Excel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>File Excel</Label>
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                  />
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground">
                      File dipilih: {selectedFile.name}
                    </p>
                  )}
                </div>
                <div className="bg-muted/50 p-4 rounded-md text-sm space-y-2">
                  <p className="font-semibold">Petunjuk:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Download template Excel terlebih dahulu</li>
                    <li>Isi data siswa sesuai format yang ada</li>
                    <li>Kolom Rombel diisi dengan nama kelas (contoh: 7A)</li>
                    <li>Jenis Kelamin: L (Laki-laki) atau P (Perempuan)</li>
                    <li>Format Tanggal: YYYY-MM-DD (contoh: 2010-01-15)</li>
                    <li>Pilih kelas tujuan sebelum upload</li>
                  </ol>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button onClick={handleImport} disabled={!selectedFile}>
                    Import
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
