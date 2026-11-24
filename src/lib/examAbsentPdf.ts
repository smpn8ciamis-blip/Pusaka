import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { paperFormat, type PdfPaper } from '@/lib/pdfPaper';
import { PRINT_CREDIT } from '@/lib/studentListPdf';
import { ellipsize } from '@/lib/examPdf';
import { ATT_LABEL, type AbsentRow } from '@/lib/examAttendance';

export interface AbsentPdfOptions {
  examName?: string | null;
  academicYear?: string | null;
  /** Tanggal ujian yang dilaporkan (yyyy-MM-dd) */
  examDate: string;
  rows: AbsentRow[];
  counts: { sakit: number; izin: number; alpa: number };
  /** Jumlah siswa di seluruh ruang & yang belum diabsen pengawas (untuk keterangan ringkasan) */
  totalStudents: number;
  notRecorded: number;
  paper?: PdfPaper;
  place?: string;
  signDate?: string; // yyyy-MM-dd
  chairTitle?: string | null;
  chairName?: string | null;
  chairNip?: string | null;
  printedAt?: Date;
}

type SchoolSettings = LetterheadSettings | null | undefined;

const clean = (v?: string | null) => (v ?? '').replace(/\s+/g, ' ').trim();
const idDate = (iso: string, withDay = false): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return format(new Date(y, m - 1, d), withDay ? 'EEEE, d MMMM yyyy' : 'd MMMM yyyy', { locale: localeId });
};

export const absentFileName = (examDate: string, paper: PdfPaper) => `siswa-tidak-hadir-ujian-${examDate}-${paper}.pdf`;

/**
 * Daftar siswa tidak hadir ujian (sakit / izin / alpa) pada satu hari, kertas A4/F4 potret, dengan kop sekolah
 * dan tanda tangan ketua panitia. Blok tanda tangan pindah halaman bila tidak muat (tidak pernah terpotong).
 */
export async function buildAbsentPdf(opts: AbsentPdfOptions, settings: SchoolSettings): Promise<jsPDF> {
  const paper = opts.paper ?? 'a4';
  const doc = new jsPDF({ unit: 'mm', format: paperFormat(paper), orientation: 'portrait' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 15, mr = 15;
  const avail = pw - ml - mr;
  const bottomLimit = ph - 14;
  const printedAt = opts.printedAt ?? new Date();

  const setFont = (style: 'normal' | 'bold' | 'italic' = 'normal', size = 10) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
  };

  // ---------- Kop & judul ----------
  let y = await addLetterheadToPDF(doc, settings as LetterheadSettings);
  setFont('bold', 12);
  doc.text('DAFTAR SISWA TIDAK HADIR', pw / 2, y, { align: 'center' });
  y += 5.5;
  const exam = clean(opts.examName).toUpperCase();
  if (exam) { doc.text(exam, pw / 2, y, { align: 'center' }); y += 5.5; }
  if (clean(opts.academicYear)) {
    doc.text(`TAHUN PELAJARAN ${clean(opts.academicYear).replace(/\s*\/\s*/, ' / ')}`, pw / 2, y, { align: 'center' });
    y += 5.5;
  }
  setFont('normal', 10);
  doc.text(`Hari / tanggal ujian : ${idDate(opts.examDate, true)}`, ml, y + 1);
  y += 6;
  const { sakit, izin, alpa } = opts.counts;
  const totalAbsent = sakit + izin + alpa;
  doc.text(`Jumlah tidak hadir : ${totalAbsent} siswa (Sakit ${sakit}, Izin ${izin}, Alpa ${alpa}) dari ${opts.totalStudents} siswa peserta`, ml, y + 1);
  y += 6.5;

  // ---------- Tabel ----------
  const head = [['NO', 'NAMA SISWA', 'KELAS', 'RUANG / MEJA', 'STATUS', 'KETERANGAN']];
  const wNo = 10, wClass = 18, wRoom = 24, wStatus = 20;
  const wName = 58;
  const wNote = Math.max(20, avail - wNo - wName - wClass - wRoom - wStatus);
  const body = opts.rows.map((r, i) => [
    String(i + 1),
    clean(r.full_name),
    clean(r.class_name),
    r.table_no ? `${r.room_no} / ${r.table_no}` : String(r.room_no),
    ATT_LABEL[r.status],
    clean(r.notes),
  ]);
  if (body.length === 0) {
    setFont('italic', 10);
    doc.text('Tidak ada siswa yang tidak hadir (nihil).', ml, y + 4);
    y += 12;
  } else {
    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: 'grid',
      margin: { left: ml, right: mr, top: 14, bottom: 16 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0], valign: 'middle' },
      headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { cellWidth: wNo, halign: 'center' },
        1: { cellWidth: wName },
        2: { cellWidth: wClass, halign: 'center' },
        3: { cellWidth: wRoom, halign: 'center' },
        4: { cellWidth: wStatus, halign: 'center' },
        5: { cellWidth: wNote },
      },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 4) d.cell.styles.fontStyle = 'bold';
      },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // Catatan: ruang yang belum mengabsen tidak dianggap tidak hadir
  if (opts.notRecorded > 0) {
    setFont('italic', 8);
    const note = `Catatan: ${opts.notRecorded} siswa belum diabsen pengawas (tidak dihitung sebagai tidak hadir).`;
    const lines = doc.splitTextToSize(note, avail) as string[];
    if (y + lines.length * 3.8 > bottomLimit) { doc.addPage(); y = 16; }
    doc.text(lines, ml, y + 2);
    y += lines.length * 3.8 + 3;
  }

  // ---------- Titimangsa & tanda tangan ketua panitia ----------
  const lineH = 4.8, sigGap = 18, sigW = 72;
  const sigH = lineH * 2 + sigGap + lineH * 2 + 2;
  if (y + 4 + sigH > bottomLimit) { doc.addPage(); y = 16; }
  const sx = pw - mr - sigW;
  const dots = (w: number) => '.'.repeat(Math.max(3, Math.floor(w / Math.max(0.1, doc.getTextWidth('.')))));
  setFont('normal', 10);
  const place = clean(opts.place);
  const dateText = opts.signDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.signDate) ? idDate(opts.signDate) : '';
  let sy = y + 6;
  doc.text(`${place ? `${place}, ` : ''}${dateText || dots(34)}`, sx, sy);
  sy += lineH;
  doc.text(`${clean(opts.chairTitle) || 'Ketua Panitia'},`, sx, sy);
  sy += sigGap + lineH;
  const name = ellipsize(doc, clean(opts.chairName), sigW);
  if (name) { setFont('bold', 10); doc.text(name, sx, sy); setFont('normal', 10); } else doc.text(dots(sigW - 6), sx, sy);
  sy += lineH;
  doc.text(`NIP. ${clean(opts.chairNip) || dots(sigW - 12)}`, sx, sy);

  // ---------- Catatan cetak & nomor halaman ----------
  const total = doc.getNumberOfPages();
  const printedText = `${PRINT_CREDIT}, ${format(printedAt, 'd MMMM yyyy', { locale: localeId })}`;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    setFont('italic', 8);
    doc.setTextColor(90, 90, 90);
    doc.text(printedText, ml, ph - 8);
    if (total > 1) doc.text(`Halaman ${p} dari ${total}`, pw - mr, ph - 8, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
  return doc;
}
