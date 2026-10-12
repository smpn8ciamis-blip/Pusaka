import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { addVerificationQR } from '@/lib/reportVerification';

/** Satu baris jurnal yang sudah dinormalisasi (siap tampil / cetak). */
export interface JournalRow {
  id: string;
  date: string; // yyyy-MM-dd
  schedule_id: string | null;
  teacher_id: string | null;
  teacher_name: string;
  teacher_nip: string | null;
  subject: string;
  class_name: string;
  start_time: string;
  end_time: string;
  material: string;
  activity: string;
  students_present: number;
  students_absent: number;
  notes: string;
}

export const shortClass = (name?: string | null): string => {
  if (!name) return '-';
  return name.split('_')[0].trim() || name;
};

export const formatTanggalID = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

export const formatTanggalPanjang = (d: Date | string) =>
  (typeof d === 'string' ? new Date(`${d}T00:00:00`) : d).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

export const shortTime = (t?: string | null) => (t ? t.slice(0, 5) : '');

export const jamLabel = (r: Pick<JournalRow, 'start_time' | 'end_time'>) => {
  const s = shortTime(r.start_time);
  const e = shortTime(r.end_time);
  if (!s) return '-';
  return e ? `${s}-${e}` : s;
};

/** Escape satu sel CSV (RFC 4180) + cegah formula injection di Excel. */
export const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
};

export type PaperSize = 'a4' | 'f4';

/** A4 = 210x297 mm, F4 (Folio) = 215x330 mm */
export const PAPER_FORMAT: Record<PaperSize, [number, number]> = {
  a4: [210, 297],
  f4: [215, 330],
};

export interface BuildJournalPdfOptions {
  paper?: PaperSize;
  rows: JournalRow[];
  settings?: (LetterheadSettings & Record<string, any>) | null;
  /** Mis. "01 Okt 2026 s/d 31 Okt 2026" */
  periodLabel: string;
  /** Baris info filter tambahan (guru, jadwal, ...) */
  filterLines?: string[];
  /** Tampilkan kolom Guru (admin / banyak guru) */
  showTeacher: boolean;
  /** Nama & NIP guru mapel untuk tanda tangan kiri (kosong jika banyak guru) */
  signerTeacherName?: string | null;
  signerTeacherNip?: string | null;
  /** URL verifikasi (token mentah di dalamnya). Kosong = mode pratinjau. */
  verifyUrl?: string | null;
  serialNumber?: string | null;
}

/**
 * Susun PDF Jurnal Mengajar. Dipakai bersama oleh pratinjau & cetak
 * agar tampilannya identik. Pratinjau tidak membawa QR asli.
 */
export async function buildJournalPdf(opts: BuildJournalPdfOptions): Promise<jsPDF> {
  const { rows, settings, periodLabel, filterLines = [], showTeacher } = opts;
  const doc = new jsPDF({ orientation: showTeacher ? 'landscape' : 'portrait', unit: 'mm', format: PAPER_FORMAT[opts.paper || 'a4'] });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const M = 14;

  let y = await addLetterheadToPDF(doc, settings as any);

  // ===== Judul =====
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text('LAPORAN JURNAL MENGAJAR', pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(70, 70, 70);
  doc.text(`Periode: ${periodLabel}`, pageWidth / 2, y, { align: 'center' });
  y += 7;

  // ===== Ringkasan =====
  const totalHadir = rows.reduce((a, r) => a + (r.students_present || 0), 0);
  const totalAbsen = rows.reduce((a, r) => a + (r.students_absent || 0), 0);
  const totalSiswa = totalHadir + totalAbsen;
  const pct = totalSiswa > 0 ? Math.round((totalHadir / totalSiswa) * 1000) / 10 : 0;
  const guruCount = new Set(rows.map((r) => r.teacher_id || r.teacher_name)).size;

  const infoLines = [
    ...filterLines,
    `Dicetak: ${formatTanggalPanjang(new Date())}`,
  ];
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  infoLines.forEach((l, i) => doc.text(l, M, y + i * 4.2));

  // Kartu ringkasan di sisi kanan
  const cards: [string, string][] = [
    ['Total Jurnal', String(rows.length)],
    ...(showTeacher ? ([['Jumlah Guru', String(guruCount)]] as [string, string][]) : []),
    ['Kehadiran Siswa', `${pct}%`],
  ];
  const cardW = 34;
  const cardH = 12;
  let cx = pageWidth - M - cards.length * (cardW + 3) + 3;
  cards.forEach(([label, value]) => {
    doc.setDrawColor(209, 213, 219);
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(cx, y - 4, cardW, cardH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(label, cx + cardW / 2, y, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(value, cx + cardW / 2, y + 5.2, { align: 'center' });
    cx += cardW + 3;
  });
  y += Math.max(infoLines.length * 4.2, cardH) + 3;

  // ===== Tabel =====
  const head = showTeacher
    ? ['No', 'Tanggal', 'Guru', 'Mapel / Kelas', 'Jam', 'Materi', 'Aktivitas', 'H', 'TH', 'Catatan']
    : ['No', 'Tanggal', 'Mapel / Kelas', 'Jam', 'Materi', 'Aktivitas', 'H', 'TH', 'Catatan'];

  const body = rows.map((r, i) => {
    const cells: (string | number)[] = [
      i + 1,
      formatTanggalID(r.date),
      ...(showTeacher ? [r.teacher_name] : []),
      `${r.subject}\n${shortClass(r.class_name)}`,
      jamLabel(r),
      r.material || '-',
      r.activity || '-',
      r.students_present ?? 0,
      r.students_absent ?? 0,
      r.notes || '-',
    ];
    return cells;
  });

  const o = showTeacher ? 1 : 0; // offset kolom setelah 'Guru'
  const columnStyles: Record<number, any> = showTeacher
    ? {
        0: { halign: 'center', cellWidth: 9 },
        1: { halign: 'center', cellWidth: 24 },
        2: { cellWidth: 34 },
        3: { cellWidth: 36 },
        4: { halign: 'center', cellWidth: 22 },
        5: { cellWidth: 'auto' },
        6: { cellWidth: 40 },
        7: { halign: 'center', cellWidth: 9 },
        8: { halign: 'center', cellWidth: 9 },
        9: { cellWidth: 36 },
      }
    : {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'center', cellWidth: 21 },
        2: { cellWidth: 26 },
        3: { halign: 'center', cellWidth: 19 },
        4: { cellWidth: 'auto' },
        5: { cellWidth: 28 },
        6: { halign: 'center', cellWidth: 8 },
        7: { halign: 'center', cellWidth: 8 },
        8: { cellWidth: 22 },
      };

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    theme: 'grid',
    margin: { left: M, right: M, bottom: 18 },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      lineColor: [209, 213, 219],
      lineWidth: 0.1,
      textColor: [17, 24, 39],
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles,
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      // Hadir hijau, tidak hadir merah bila > 0
      if (d.column.index === 6 + o) { d.cell.styles.textColor = [22, 101, 52]; d.cell.styles.fontStyle = 'bold'; }
      if (d.column.index === 7 + o && Number(d.cell.raw) > 0) {
        d.cell.styles.textColor = [185, 28, 28];
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });

  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Tidak ada jurnal pada periode / filter ini.', pageWidth / 2, (doc as any).lastAutoTable.finalY + 8, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  const noteY = (doc as any).lastAutoTable.finalY + 4;
  doc.text('H = jumlah siswa hadir, TH = jumlah siswa tidak hadir', M, noteY);

  // ===== Blok tanda tangan: Kepala Sekolah (kiri) · Guru Mapel (kanan); QR di pojok kiri bawah =====
  const sigH = 50;
  const qrSize = 26;
  const qrPad = 3;
  const box = qrSize + qrPad * 2;
  const qrBlockH = box + 10; // kotak + teks di bawahnya
  const bottomLimit = pageHeight - 16;
  let top = noteY + 8;
  if (top + sigH + 4 + qrBlockH > bottomLimit) {
    doc.addPage();
    top = 22;
  }

  const colW = 62;
  const leftCx = M + colW / 2;
  const rightCx = pageWidth - M - colW / 2;

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  // Tanggal di atas kolom kanan
  doc.text(formatTanggalPanjang(new Date()), rightCx, top, { align: 'center' });

  const roleY = top + 5;
  const lineY = top + 36;
  const nameY = lineY + 5;
  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 0, 0);

  // Kiri: Kepala Sekolah
  doc.text('Mengetahui,', leftCx, roleY, { align: 'center' });
  doc.text(settings?.headmaster_position || 'Kepala Sekolah', leftCx, roleY + 5, { align: 'center' });
  doc.line(leftCx - 26, lineY, leftCx + 26, lineY);
  doc.setFont('helvetica', 'bold');
  doc.text(settings?.headmaster_name || 'Nama Kepala Sekolah', leftCx, nameY, { align: 'center' });
  if (settings?.headmaster_nip) {
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${settings.headmaster_nip}`, leftCx, nameY + 5, { align: 'center' });
  }

  // Kanan: Guru Mapel
  doc.setFont('helvetica', 'normal');
  doc.text('Guru Mata Pelajaran,', rightCx, roleY + 5, { align: 'center' });
  doc.line(rightCx - 26, lineY, rightCx + 26, lineY);
  doc.setFont('helvetica', 'bold');
  doc.text(opts.signerTeacherName || '..............................', rightCx, nameY, { align: 'center' });
  if (opts.signerTeacherNip) {
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${opts.signerTeacherNip}`, rightCx, nameY + 5, { align: 'center' });
  }

  // QR verifikasi: pojok kiri bawah halaman terakhir
  const boxX = M;
  const boxY = bottomLimit - qrBlockH;
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(boxX, boxY, box, box, 2, 2, 'FD');
  const midCx = boxX + box / 2;

  if (opts.verifyUrl) {
    await addVerificationQR(doc, opts.verifyUrl, boxX + qrPad, boxY + qrPad, qrSize);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(22, 101, 52);
    doc.text('DOKUMEN TERVERIFIKASI', midCx, boxY + box + 4, { align: 'center' });
    if (opts.serialNumber) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 100, 100);
      doc.text(`No. Seri: ${opts.serialNumber}`, midCx, boxY + box + 7.5, { align: 'center' });
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('QR verifikasi', midCx, boxY + box / 2 - 1, { align: 'center' });
    doc.text('dibuat saat cetak', midCx, boxY + box / 2 + 3, { align: 'center' });
  }

  // ===== Footer di semua halaman =====
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.2);
    doc.line(M, pageHeight - 12, pageWidth - M, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text('Laporan Jurnal Mengajar', M, pageHeight - 7);
    doc.text(`Halaman ${i} dari ${total}`, pageWidth - M, pageHeight - 7, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);

  return doc;
}
