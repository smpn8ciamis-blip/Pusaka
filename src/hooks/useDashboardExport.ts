import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { addLetterheadToPDF, addSignatureToPDF } from '@/lib/pdfLetterhead';
import {
  toLocalDateStr,
  mergeAttendanceByStudentDay,
  fetchAllPages,
  type AttendanceStatus,
} from '@/lib/attendanceUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Data laporan: memakai aturan yang SAMA dengan dashboard (src/lib/attendanceUtils.ts)
//   • absensi manual + RFID digabung, 1 siswa + 1 tanggal = 1 catatan
//   • "Hadir" sudah termasuk terlambat; "Terlambat" ditampilkan terpisah sebagai subset
//   • tanggal memakai zona waktu lokal (bukan UTC)
// ─────────────────────────────────────────────────────────────────────────────

interface Counts {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  total: number;
}

interface ReportStudent extends Counts {
  nis: string;
  nisn: string;
  name: string;
}

interface ReportClass {
  label: string;
  grade: number;
  className: string;
  students: ReportStudent[];
}

interface ReportData {
  classes: ReportClass[];
  totals: Counts;
}

const emptyCounts = (): Counts => ({ hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, total: 0 });

const addStatus = (target: Counts, status: AttendanceStatus) => {
  if (status === 'hadir') target.hadir++;
  else if (status === 'terlambat') {
    target.hadir++;
    target.terlambat++;
  } else if (status === 'izin') target.izin++;
  else if (status === 'sakit') target.sakit++;
  else if (status === 'alpa') target.alpa++;
  target.total = target.hadir + target.izin + target.sakit + target.alpa;
};

async function loadReportData(startDate: Date, endDate: Date): Promise<ReportData> {
  const start = toLocalDateStr(startDate);
  const end = toLocalDateStr(endDate);

  const [manual, rfid, students] = await Promise.all([
    fetchAllPages<any>((from, to) =>
      supabase.from('attendance').select('id, student_id, date, status, schedule_id').gte('date', start).lte('date', end).order('id').range(from, to)
    ),
    fetchAllPages<any>((from, to) =>
      supabase.from('rfid_attendance').select('id, student_id, date, status').gte('date', start).lte('date', end).order('id').range(from, to)
    ),
    fetchAllPages<any>((from, to) =>
      supabase.from('students').select('id, nis, nisn, full_name, classes(name, grade)').order('id').range(from, to)
    ),
  ]);

  const studentMap = new Map<string, any>(students.map((s) => [s.id, s]));
  const classMap = new Map<string, { label: string; grade: number; className: string; students: Map<string, ReportStudent> }>();
  const totals = emptyCounts();

  for (const record of mergeAttendanceByStudentDay(manual, rfid)) {
    const student = studentMap.get(record.student_id);
    const className: string = student?.classes?.name || 'Tanpa Kelas';
    const grade: number = student?.classes?.grade ?? 0;
    const label = student?.classes ? `${className} (${grade})` : className;

    let cls = classMap.get(label);
    if (!cls) {
      cls = { label, grade, className, students: new Map() };
      classMap.set(label, cls);
    }

    // Kunci per siswa memakai id (bukan NISN) supaya siswa tanpa NISN tidak tergabung.
    let row = cls.students.get(record.student_id);
    if (!row) {
      row = { nis: student?.nis || '-', nisn: student?.nisn || '-', name: student?.full_name || '-', ...emptyCounts() };
      cls.students.set(record.student_id, row);
    }
    addStatus(row, record.status);
    addStatus(totals, record.status);
  }

  const classes: ReportClass[] = Array.from(classMap.values())
    .map((c) => ({
      label: c.label,
      grade: c.grade,
      className: c.className,
      students: Array.from(c.students.values()).sort((a, b) => a.name.localeCompare(b.name, 'id')),
    }))
    .sort((a, b) => a.grade - b.grade || a.className.localeCompare(b.className, 'id', { numeric: true }));

  return { classes, totals };
}

/** Nama sheet Excel: tanpa karakter terlarang, maks. 31 karakter, dan unik. */
function makeSheetName(label: string, used: Set<string>): string {
  const base = label.replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 31) || 'Kelas';
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

// `attendanceRecap` dipertahankan di tanda tangan fungsi agar pemanggil tidak berubah,
// tetapi ringkasan laporan dihitung dari data yang sama dengan tabelnya.
export const useDashboardExport = (startDate: Date, endDate: Date, _attendanceRecap?: any) => {
  const handleExportPDF = async () => {
    try {
      toast.info('Membuat laporan PDF...');

      const report = await loadReportData(startDate, endDate);
      if (report.classes.length === 0) {
        toast.warning('Tidak ada data absensi pada periode ini');
        return;
      }

      const { data: settings } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();

      const doc = new jsPDF();
      await addLetterheadToPDF(doc, settings);

      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 60;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('LAPORAN REKAP KEHADIRAN', pageWidth / 2, yPos, { align: 'center' });
      yPos += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Periode: ${format(startDate, 'dd MMMM yyyy', { locale: localeId })} - ${format(endDate, 'dd MMMM yyyy', { locale: localeId })}`,
        pageWidth / 2, yPos, { align: 'center' }
      );
      yPos += 5;

      doc.setFontSize(8);
      doc.text(`Dicetak pada: ${format(new Date(), 'dd MMMM yyyy, HH:mm', { locale: localeId })} WIB`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      const t = report.totals;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Ringkasan:', 14, yPos);
      yPos += 6;

      doc.setFont('helvetica', 'normal');
      doc.text(`Total Catatan Kehadiran: ${t.total}`, 20, yPos);
      yPos += 5;
      doc.text(`Hadir: ${t.hadir} (terlambat: ${t.terlambat}) | Izin: ${t.izin} | Sakit: ${t.sakit} | Alpa: ${t.alpa}`, 20, yPos);
      yPos += 5;
      doc.setFontSize(8);
      doc.text('Keterangan: H = hadir (sudah termasuk terlambat), I = izin, S = sakit, A = alpa. 1 hari = 1 catatan per siswa.', 20, yPos);
      yPos += 8;

      for (const cls of report.classes) {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`Kelas: ${cls.label}`, 14, yPos);
        yPos += 7;

        const tableData = cls.students.map((s, index) => [
          (index + 1).toString(),
          s.nisn,
          s.name,
          s.hadir.toString(),
          s.izin.toString(),
          s.sakit.toString(),
          s.alpa.toString(),
          s.total.toString(),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['No', 'NISN', 'Nama Siswa', 'H', 'I', 'S', 'A', 'Total']],
          body: tableData,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
          headStyles: { fillColor: [59, 130, 246], fontStyle: 'bold', halign: 'center' },
          margin: { left: (pageWidth - 153) / 2 },
          columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 25 },
            2: { cellWidth: 55, halign: 'left' },
            3: { cellWidth: 12 },
            4: { cellWidth: 12 },
            5: { cellWidth: 12 },
            6: { cellWidth: 12 },
            7: { cellWidth: 15 },
          },
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
      toast.error('Gagal membuat laporan PDF: ' + (error?.message || 'terjadi kesalahan'));
    }
  };

  const handleExportExcel = async () => {
    try {
      toast.info('Membuat file Excel...');

      const report = await loadReportData(startDate, endDate);
      if (report.classes.length === 0) {
        toast.warning('Tidak ada data absensi pada periode ini');
        return;
      }

      const wb = XLSX.utils.book_new();
      const t = report.totals;

      const summaryData = [
        ['LAPORAN REKAP KEHADIRAN'],
        [`Periode: ${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`],
        [],
        ['Ringkasan Kehadiran (1 hari = 1 catatan per siswa)'],
        ['Status', 'Jumlah'],
        ['Total', t.total],
        ['Hadir (termasuk terlambat)', t.hadir],
        ['  - di antaranya terlambat', t.terlambat],
        ['Izin', t.izin],
        ['Sakit', t.sakit],
        ['Alpa', t.alpa],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Ringkasan');

      const usedNames = new Set<string>(['ringkasan']);
      for (const cls of report.classes) {
        const classData: (string | number)[][] = [
          [cls.label],
          [],
          ['NIS', 'NISN', 'Nama Siswa', 'Hadir (termasuk terlambat)', 'Terlambat', 'Izin', 'Sakit', 'Alpa', 'Total'],
        ];
        cls.students.forEach((s) => {
          classData.push([s.nis, s.nisn, s.name, s.hadir, s.terlambat, s.izin, s.sakit, s.alpa, s.total]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(classData), makeSheetName(cls.label, usedNames));
      }

      XLSX.writeFile(wb, `Rekap-Kehadiran-${format(startDate, 'dd-MM-yyyy')}-${format(endDate, 'dd-MM-yyyy')}.xlsx`);
      toast.success('File Excel berhasil dibuat');
    } catch (error: any) {
      toast.error('Gagal membuat file Excel: ' + (error?.message || 'terjadi kesalahan'));
    }
  };

  return { handleExportPDF, handleExportExcel };
};
