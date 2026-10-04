import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Upload, Download, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { format, parse } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function ImportAttendance() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const queryClient = useQueryClient();

  const handleDownloadTemplate = () => {
    // Create template data
    const template = [
      {
        'Tanggal': '2024-01-15',
        'NIS': '2024001',
        'NISN': '0012345678',
        'Nama Siswa': 'Contoh Nama Siswa',
        'Status': 'hadir',
        'Keterangan': 'Catatan jika ada'
      },
      {
        'Tanggal': '2024-01-15',
        'NIS': '2024002',
        'NISN': '0012345679',
        'Nama Siswa': 'Contoh Nama Siswa 2',
        'Status': 'sakit',
        'Keterangan': 'Sakit demam'
      }
    ];

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // Tanggal
      { wch: 12 }, // NIS
      { wch: 15 }, // NISN
      { wch: 25 }, // Nama Siswa
      { wch: 10 }, // Status
      { wch: 30 }  // Keterangan
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Template Absensi');

    // Save file
    XLSX.writeFile(wb, 'Template_Import_Absensi.xlsx');
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

    setIsImporting(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Anda harus login terlebih dahulu');
        return;
      }

      // Get teacher data
      const { data: teacherData, error: teacherError } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (teacherError || !teacherData) {
        toast.error('Data guru tidak ditemukan');
        return;
      }

      // Get homeroom class
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id')
        .eq('homeroom_teacher_id', teacherData.id)
        .single();

      if (classError || !classData) {
        toast.error('Anda bukan wali kelas');
        return;
      }

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
            setIsImporting(false);
            return;
          }

          const errors: string[] = [];
          const validRecords: any[] = [];

          // Get all students in class
          const { data: students, error: studentsError } = await supabase
            .from('students')
            .select('id, nis, nisn, full_name')
            .eq('class_id', classData.id);

          if (studentsError) {
            toast.error('Gagal mengambil data siswa');
            setIsImporting(false);
            return;
          }

          // Validate and transform data
          for (let i = 0; i < jsonData.length; i++) {
            const row: any = jsonData[i];
            const rowNum = i + 2; // Excel row number (header is row 1)

            // Required fields
            const dateStr = row['Tanggal']?.toString().trim();
            const nis = row['NIS']?.toString().trim();
            const nisn = row['NISN']?.toString().trim();
            const status = row['Status']?.toString().trim().toLowerCase();
            const notes = row['Keterangan']?.toString().trim() || null;

            // Validate required fields
            if (!dateStr || !nis || !status) {
              errors.push(`Baris ${rowNum}: Tanggal, NIS, dan Status wajib diisi`);
              continue;
            }

            // Validate date format
            let attendanceDate: Date;
            try {
              // Try parsing date in different formats
              if (dateStr.includes('/')) {
                attendanceDate = parse(dateStr, 'dd/MM/yyyy', new Date());
              } else if (dateStr.includes('-')) {
                attendanceDate = parse(dateStr, 'yyyy-MM-dd', new Date());
              } else {
                throw new Error('Format tanggal tidak valid');
              }

              if (isNaN(attendanceDate.getTime())) {
                throw new Error('Format tanggal tidak valid');
              }
            } catch (error) {
              errors.push(`Baris ${rowNum}: Format tanggal tidak valid (gunakan yyyy-MM-dd atau dd/MM/yyyy)`);
              continue;
            }

            // Validate status
            if (!['hadir', 'sakit', 'izin', 'alpa'].includes(status)) {
              errors.push(`Baris ${rowNum}: Status harus hadir, sakit, izin, atau alpa`);
              continue;
            }

            // Find student by NIS or NISN
            const student = students?.find(s => 
              s.nis === nis || s.nisn === nisn
            );

            if (!student) {
              errors.push(`Baris ${rowNum}: Siswa dengan NIS ${nis} tidak ditemukan di kelas ini`);
              continue;
            }

            // Validate student has a name
            if (!student.full_name || student.full_name.trim() === '') {
              errors.push(`Baris ${rowNum}: Data siswa dengan NIS ${nis} tidak lengkap (nama kosong)`);
              continue;
            }

            // Get schedule for the attendance date
            const dayOfWeek = attendanceDate.getDay();
            const { data: daySchedule } = await supabase
              .from('schedules')
              .select('id')
              .eq('class_id', classData.id)
              .eq('day_of_week', dayOfWeek)
              .order('start_time', { ascending: true })
              .limit(1)
              .maybeSingle();

            let scheduleId = daySchedule?.id;

            // If no schedule for that day, get any schedule for the class
            if (!scheduleId) {
              const { data: anySchedule } = await supabase
                .from('schedules')
                .select('id')
                .eq('class_id', classData.id)
                .limit(1)
                .maybeSingle();

              scheduleId = anySchedule?.id;

              if (!scheduleId) {
                errors.push(`Baris ${rowNum}: Tidak ada jadwal untuk kelas ini. Tambahkan jadwal terlebih dahulu.`);
                continue;
              }
            }

            // Check if attendance already exists for this student, date, and schedule
            const { data: existingAttendance } = await supabase
              .from('attendance')
              .select('id')
              .eq('student_id', student.id)
              .eq('date', format(attendanceDate, 'yyyy-MM-dd'))
              .eq('schedule_id', scheduleId)
              .maybeSingle();

            if (existingAttendance) {
              errors.push(`Baris ${rowNum}: Absensi untuk ${student.full_name} pada tanggal ${format(attendanceDate, 'dd/MM/yyyy')} sudah ada`);
              continue;
            }

            validRecords.push({
              student_id: student.id,
              date: format(attendanceDate, 'yyyy-MM-dd'),
              status: status,
              notes: notes,
              created_by: user.id,
              schedule_id: scheduleId
            });
          }

          // Show errors if any
          if (errors.length > 0) {
            const errorMessage = errors.slice(0, 5).join('\n');
            toast.error(`Ditemukan ${errors.length} error:\n${errorMessage}${errors.length > 5 ? '\n...' : ''}`, {
              duration: 10000
            });
          }

          // Insert valid records
          if (validRecords.length > 0) {
            const { error: insertError } = await supabase
              .from('attendance')
              .insert(validRecords);

            if (insertError) {
              toast.error(`Gagal mengimpor data: ${insertError.message}`);
              setIsImporting(false);
              return;
            }

            toast.success(`Berhasil mengimpor ${validRecords.length} data absensi`);
            queryClient.invalidateQueries({ queryKey: ['homeroom-attendance'] });
            setIsDialogOpen(false);
            setSelectedFile(null);
          } else if (errors.length === 0) {
            toast.error('Tidak ada data valid untuk diimpor');
          }

          setIsImporting(false);
        } catch (error: any) {
          console.error('Import error:', error);
          toast.error(`Gagal membaca file: ${error.message}`);
          setIsImporting(false);
        }
      };

      reader.onerror = () => {
        toast.error('Gagal membaca file');
        setIsImporting(false);
      };

      reader.readAsBinaryString(selectedFile);
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(`Gagal mengimpor data: ${error.message}`);
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="w-4 h-4 mr-2" />
          Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Data Absensi dari Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Petunjuk Import</AlertTitle>
            <AlertDescription className="text-sm space-y-2 mt-2">
              <p>1. Download template Excel terlebih dahulu</p>
              <p>2. Isi data absensi sesuai format template</p>
              <p>3. Format tanggal: yyyy-MM-dd (contoh: 2024-01-15)</p>
              <p>4. Status yang valid: hadir, sakit, izin, alpa</p>
              <p>5. Upload file yang sudah diisi</p>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Button 
              onClick={handleDownloadTemplate} 
              variant="outline" 
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template Excel
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Pilih File Excel</Label>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={isImporting}
            />
            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                File terpilih: {selectedFile.name}
              </p>
            )}
          </div>

          <Button 
            onClick={handleImport} 
            disabled={!selectedFile || isImporting}
            className="w-full"
          >
            {isImporting ? (
              <>
                <FileSpreadsheet className="w-4 h-4 mr-2 animate-spin" />
                Mengimpor...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Import Data
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}