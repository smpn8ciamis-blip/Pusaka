import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { addLetterheadToPDF, addSignatureToPDF } from '@/lib/pdfLetterhead';

export const useDashboardExport = (startDate: Date, endDate: Date, attendanceRecap: any) => {
  const handleExportPDF = async () => {
    try {
      toast.info('Membuat laporan PDF...');
      
      const start = startDate.toISOString().split('T')[0];
      const end = endDate.toISOString().split('T')[0];
      
      const { data: attendanceData, error } = await supabase
        .from('attendance')
        .select(`*, students(nisn, full_name, class_id, classes(name, grade)), schedules(subject, classes(name, grade))`)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true });
      
      if (error) throw error;

      const { data: settings } = await supabase
        .from('school_settings')
        .select('*')
        .single();

      const doc = new jsPDF();
      
      await addLetterheadToPDF(doc, settings);
      
      let yPos = 60;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('LAPORAN REKAP KEHADIRAN', doc.internal.pageSize.getWidth() / 2, yPos, { align: 'center' });
      yPos += 7;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Periode: ${format(startDate, 'dd MMMM yyyy', { locale: localeId })} - ${format(endDate, 'dd MMMM yyyy', { locale: localeId })}`, doc.internal.pageSize.getWidth() / 2, yPos, { align: 'center' });
      yPos += 5;
      
      doc.setFontSize(8);
      doc.text(`Dicetak pada: ${format(new Date(), 'dd MMMM yyyy, HH:mm', { locale: localeId })} WIB`, doc.internal.pageSize.getWidth() / 2, yPos, { align: 'center' });
      yPos += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Ringkasan:', 14, yPos);
      yPos += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Kehadiran: ${attendanceRecap?.total || 0}`, 20, yPos);
      yPos += 5;
      doc.text(`Hadir: ${attendanceRecap?.hadir || 0} | Izin: ${attendanceRecap?.izin || 0} | Sakit: ${attendanceRecap?.sakit || 0} | Alpa: ${attendanceRecap?.alpa || 0}`, 20, yPos);
      yPos += 10;

      const classSummary = new Map();
      attendanceData?.forEach((record: any) => {
        const className = record.students?.classes?.name || 'Unknown';
        const grade = record.students?.classes?.grade || '';
        const classKey = `${className} (${grade})`;
        
        if (!classSummary.has(classKey)) {
          classSummary.set(classKey, []);
        }
        classSummary.get(classKey).push(record);
      });

      for (const [className, records] of classSummary.entries()) {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`Kelas: ${className}`, 14, yPos);
        yPos += 7;

        const studentData = new Map();
        (records as any[]).forEach((record) => {
          const studentKey = record.students?.nisn || '';
          if (!studentData.has(studentKey)) {
            studentData.set(studentKey, {
              nisn: record.students?.nisn || '-',
              name: record.students?.full_name || '-',
              hadir: 0,
              izin: 0,
              sakit: 0,
              alpa: 0
            });
          }
          const student = studentData.get(studentKey);
          if (record.status === 'hadir') student.hadir++;
          else if (record.status === 'izin') student.izin++;
          else if (record.status === 'sakit') student.sakit++;
          else if (record.status === 'alpa') student.alpa++;
        });

        const tableData = Array.from(studentData.values())
          .sort((a, b) => {
            const nisnCompare = a.nisn.localeCompare(b.nisn);
            if (nisnCompare !== 0) return nisnCompare;
            return a.name.localeCompare(b.name);
          })
          .map((student, index) => [
            (index + 1).toString(),
            student.nisn,
            student.name,
            student.hadir.toString(),
            student.izin.toString(),
            student.sakit.toString(),
            student.alpa.toString(),
            (student.hadir + student.izin + student.sakit + student.alpa).toString()
          ]);

        autoTable(doc, {
          startY: yPos,
          head: [['No', 'NISN', 'Nama Siswa', 'H', 'I', 'S', 'A', 'Total']],
          body: tableData,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
          headStyles: { fillColor: [59, 130, 246], fontStyle: 'bold', halign: 'center' },
          margin: { left: (doc.internal.pageSize.getWidth() - 153) / 2 },
          columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 25 },
            2: { cellWidth: 55, halign: 'left' },
            3: { cellWidth: 12 },
            4: { cellWidth: 12 },
            5: { cellWidth: 12 },
            6: { cellWidth: 12 },
            7: { cellWidth: 15 }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }
      
      await addSignatureToPDF(doc, settings, settings?.headmaster_name, settings?.headmaster_nip, yPos);

      doc.save(`Rekap-Kehadiran-${format(startDate, 'dd-MM-yyyy')}-${format(endDate, 'dd-MM-yyyy')}.pdf`);
      toast.success('Laporan PDF berhasil dibuat');
    } catch (error: any) {
      toast.error('Gagal membuat laporan PDF: ' + error.message);
    }
  };

  const handleExportExcel = async () => {
    try {
      toast.info('Membuat file Excel...');
      
      const start = startDate.toISOString().split('T')[0];
      const end = endDate.toISOString().split('T')[0];
      
      const { data: attendanceData, error } = await supabase
        .from('attendance')
        .select(`*, students(nis, full_name, class_id, classes(name, grade)), schedules(subject, classes(name, grade))`)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true });
      
      if (error) throw error;

      const wb = XLSX.utils.book_new();

      const summaryData = [
        ['LAPORAN REKAP KEHADIRAN'],
        [`Periode: ${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`],
        [],
        ['Ringkasan Kehadiran'],
        ['Status', 'Jumlah'],
        ['Total', attendanceRecap?.total || 0],
        ['Hadir', attendanceRecap?.hadir || 0],
        ['Izin', attendanceRecap?.izin || 0],
        ['Sakit', attendanceRecap?.sakit || 0],
        ['Alpa', attendanceRecap?.alpa || 0]
      ];
      
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Ringkasan');

      const classSummary = new Map();
      attendanceData?.forEach((record: any) => {
        const className = record.students?.classes?.name || 'Unknown';
        const grade = record.students?.classes?.grade || '';
        const classKey = `${className} (${grade})`;
        
        if (!classSummary.has(classKey)) {
          classSummary.set(classKey, []);
        }
        classSummary.get(classKey).push(record);
      });

      for (const [className, records] of classSummary.entries()) {
        const studentData = new Map();
        (records as any[]).forEach((record) => {
          const studentKey = record.students?.nis || '';
          if (!studentData.has(studentKey)) {
            studentData.set(studentKey, {
              nis: record.students?.nis || '-',
              name: record.students?.full_name || '-',
              hadir: 0,
              izin: 0,
              sakit: 0,
              alpa: 0
            });
          }
          const student = studentData.get(studentKey);
          if (record.status === 'hadir') student.hadir++;
          else if (record.status === 'izin') student.izin++;
          else if (record.status === 'sakit') student.sakit++;
          else if (record.status === 'alpa') student.alpa++;
        });

        const classData = [
          [className],
          [],
          ['NIS', 'Nama Siswa', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Total']
        ];

        Array.from(studentData.values()).forEach(student => {
          classData.push([
            student.nis,
            student.name,
            student.hadir,
            student.izin,
            student.sakit,
            student.alpa,
            student.hadir + student.izin + student.sakit + student.alpa
          ]);
        });

        const classSheet = XLSX.utils.aoa_to_sheet(classData);
        const sheetName = className.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, classSheet, sheetName);
      }

      XLSX.writeFile(wb, `Rekap-Kehadiran-${format(startDate, 'dd-MM-yyyy')}-${format(endDate, 'dd-MM-yyyy')}.xlsx`);
      toast.success('File Excel berhasil dibuat');
    } catch (error: any) {
      toast.error('Gagal membuat file Excel: ' + error.message);
    }
  };

  return { handleExportPDF, handleExportExcel };
};
