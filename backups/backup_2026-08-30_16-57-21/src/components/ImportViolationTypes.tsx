import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const ImportViolationTypes = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      setPreviewData(jsonData.slice(0, 5));
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal membaca file',
        variant: 'destructive',
      });
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        nama: 'Terlambat masuk kelas',
        deskripsi: 'Datang terlambat ke kelas',
        poin: 5,
        kategori: 'ringan',
      },
      {
        nama: 'Tidak mengerjakan PR',
        deskripsi: 'Tidak menyelesaikan pekerjaan rumah',
        poin: 10,
        kategori: 'ringan',
      },
      {
        nama: 'Ribut di kelas',
        deskripsi: 'Membuat keributan saat pelajaran berlangsung',
        poin: 20,
        kategori: 'sedang',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'template_jenis_pelanggaran.xlsx');

    toast({
      title: 'Template berhasil diunduh',
      description: 'Silakan isi template dan upload kembali',
    });
  };

  const handleImport = async () => {
    if (!file) {
      toast({
        title: 'Error',
        description: 'Pilih file terlebih dahulu',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        throw new Error('File kosong');
      }

      // Validate and transform data
      const violationTypes = jsonData.map((row) => {
        const name = row.nama || row.name || row.Nama || row.Name;
        const description = row.deskripsi || row.description || row.Deskripsi || row.Description || '';
        const points = parseInt(row.poin || row.points || row.Poin || row.Points || '0');
        const category = (row.kategori || row.category || row.Kategori || row.Category || 'ringan').toLowerCase();

        if (!name) {
          throw new Error('Kolom "nama" tidak boleh kosong');
        }

        if (points < 0) {
          throw new Error(`Poin tidak valid untuk ${name}`);
        }

        if (!['ringan', 'sedang', 'berat'].includes(category)) {
          throw new Error(`Kategori tidak valid untuk ${name}. Harus: ringan, sedang, atau berat`);
        }

        return {
          name,
          description,
          points,
          category,
          is_active: true,
        };
      });

      // Insert data
      const { error } = await supabase
        .from('violation_types')
        .insert(violationTypes);

      if (error) throw error;

      toast({
        title: 'Import berhasil',
        description: `${violationTypes.length} jenis pelanggaran berhasil diimport`,
      });

      setIsOpen(false);
      setFile(null);
      setPreviewData([]);
      window.location.reload();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Gagal import data',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Import dari Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Jenis Pelanggaran</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Alert>
            <FileSpreadsheet className="h-4 w-4" />
            <AlertDescription>
              Upload file Excel/CSV dengan kolom: <strong>nama</strong>, <strong>deskripsi</strong>, <strong>poin</strong>, <strong>kategori</strong> (ringan/sedang/berat)
            </AlertDescription>
          </Alert>

          <div>
            <Button
              variant="outline"
              onClick={downloadTemplate}
              className="w-full mb-4"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Template Excel
            </Button>
          </div>

          <div>
            <Label>Upload File Excel/CSV</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
          </div>

          {previewData.length > 0 && (
            <div>
              <Label>Preview Data (5 baris pertama):</Label>
              <div className="mt-2 border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">Nama</th>
                      <th className="p-2 text-left">Deskripsi</th>
                      <th className="p-2 text-left">Poin</th>
                      <th className="p-2 text-left">Kategori</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row: any, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">{row.nama || row.name || '-'}</td>
                        <td className="p-2">{row.deskripsi || row.description || '-'}</td>
                        <td className="p-2">{row.poin || row.points || '0'}</td>
                        <td className="p-2">{row.kategori || row.category || 'ringan'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleImport}
              disabled={!file || isImporting}
              className="flex-1"
            >
              {isImporting ? 'Importing...' : 'Import'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsOpen(false);
                setFile(null);
                setPreviewData([]);
              }}
              disabled={isImporting}
            >
              Batal
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
