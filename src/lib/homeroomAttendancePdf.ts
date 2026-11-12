import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { paperFormat, type PdfPaper } from '@/lib/pdfPaper';
import { PRINT_CREDIT } from '@/lib/studentListPdf';

export interface HomeroomRecapStudent {
  id: string;
  nisn?: string | null;
  nis?: string | null;
  name: string;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  total: number;
}

export interface HomeroomRecapRecord {
  student_id: string;
  date: string; // YYYY-MM-DD
  status: string;
}

export interface HomeroomRecapPdfOptions {
  className: string;
  homeroomName?: string | null;
  homeroomNip?: string | null;
  /** Periode rekap (YYYY-MM-DD) */
  startDate: string;
  endDate: string;
  /** Siswa dalam urutan yang akan dicetak */
  students: HomeroomRecapStudent[];
  records: HomeroomRecapRecord[];
  /** Titimangsa: kota + tanggal tanda tangan (YYYY-MM-DD) */
  place: string;
  signDate: string;
  paper?: PdfPaper;
  printedAt?: Date;
  /** Catatan kecil di bawah keterangan, mis. bila hanya sebagian siswa yang dicetak */
  note?: string;
}

type SchoolSettings = LetterheadSettings | null | undefined;

/** Bila tanggal berdata lebih dari ini, kolom harian tidak muat dan hanya total yang dicetak. */
export const MAX_DAY_COLUMNS = 45;

const clean = (v?: string | null) => (v ?? '').replace(/\s+/g, ' ').trim();

/** "2026-11-12" → Date lokal (tanpa pergeseran zona waktu). */
export const parseIsoDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
};

export const formatIdDate = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return format(parseIsoDate(iso), 'd MMMM yyyy', { locale: localeId });
};

export const toTitleCase = (name: string): string =>
  (name || '')
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export const homeroomRecapFileName = (className: string, start: string, end: string) => {
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `Rekap-Absensi-${slug(className) || 'Kelas'}-${start}-${end}.pdf`;
};

const STATUS_CODE: Record<string, string> = { hadir: 'H', sakit: 'S', izin: 'I', alpa: 'A' };
const STATUS_FILL: Record<string, [number, number, number]> = {
  H: [16, 185, 129],
  S: [245, 158, 11],
  I: [59, 130, 246],
  A: [239, 68, 68],
};

/**
 * Rekap kehadiran siswa satu kelas (landscape, A4 atau F4): kop sekolah, judul, kelas, periode,
 * tabel per tanggal + total H/S/I/A, keterangan, titimangsa dan tanda tangan wali kelas, serta catatan
 * "Dicetak dari Pusaka Nedelcis" di tiap halaman. Blok tanda tangan tidak pernah terpotong:
 * bila tidak muat di halaman terakhir tabel, seluruh blok pindah ke halaman berikutnya.
 */
export async function buildHomeroomAttendancePdf(opts: HomeroomRecapPdfOptions, settings: SchoolSettings): Promise<jsPDF> {
  const paper = opts.paper ?? 'a4';
  const doc = new jsPDF({ unit: 'mm', format: paperFormat(paper), orientation: 'landscape' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 10;
  const mr = 10;
  const avail = pw - ml - mr;
  const bottomLimit = ph - 13;
  const printedAt = opts.printedAt ?? new Date();
  const lineH = 4.6;

  const setFont = (style: 'normal' | 'bold' | 'italic' = 'normal', size = 10) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
  };

  // ---------- Kop & judul ----------
  const startY = await addLetterheadToPDF(doc, settings as LetterheadSettings);
  setFont('bold', 12);
  doc.text('REKAP KEHADIRAN SISWA WALI KELAS', pw / 2, startY, { align: 'center' });
  setFont('normal', 10);
  doc.text(`Kelas: ${clean(opts.className) || '-'}`, 14, startY + 8);
  doc.text(`Periode: ${formatIdDate(opts.startDate)} s/d ${formatIdDate(opts.endDate)}`, 14, startY + 14);

  // ---------- Kolom tanggal: hanya tanggal yang punya data ----------
  const dates = Array.from(
    new Set(opts.records.filter((r) => r.date >= opts.startDate && r.date <= opts.endDate).map((r) => r.date))
  ).sort();
  const showDays = dates.length > 0 && dates.length <= MAX_DAY_COLUMNS;
  const dayCols = showDays ? dates : [];
  const n = dayCols.length;

  const wNo = 8;
  const wNisn = 20;
  const wTot = 7;
  const wPct = 10;
  const wNameMin = 42;
  const totalsW = wTot * 4 + wPct;
  const wDay = n ? Math.min(7, Math.floor(((avail - wNo - wNisn - wNameMin - totalsW) / n) * 100) / 100) : 0;
  const wName = Math.min(70, avail - wNo - wNisn - totalsW - n * wDay);

  const codeMap = new Map<string, string>(); // `${student}|${date}` → H/S/I/A
  opts.records.forEach((r) => codeMap.set(`${r.student_id}|${r.date}`, STATUS_CODE[r.status] ?? 'A'));

  const head = ['No', 'NISN', 'Nama Siswa', ...dayCols.map((d) => String(parseInt(d.slice(8, 10), 10))), 'H', 'S', 'I', 'A', '%'];
  const body = opts.students.map((s, i) => [
    String(i + 1),
    clean(s.nisn) || clean(s.nis),
    toTitleCase(s.name),
    ...dayCols.map((d) => codeMap.get(`${s.id}|${d}`) ?? '-'),
    String(s.hadir),
    String(s.sakit),
    String(s.izin),
    String(s.alpa),
    s.total > 0 ? `${Math.round((s.hadir / s.total) * 100)}%` : '-',
  ]);

  const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' }> = {
    0: { cellWidth: wNo },
    1: { cellWidth: wNisn },
    2: { cellWidth: wName, halign: 'left' },
  };
  for (let i = 0; i < n; i++) columnStyles[3 + i] = { cellWidth: wDay };
  for (let i = 0; i < 4; i++) columnStyles[3 + n + i] = { cellWidth: wTot };
  columnStyles[3 + n + 4] = { cellWidth: wPct };

  autoTable(doc, {
    startY: startY + 19,
    head: [head],
    body,
    theme: 'grid',
    headStyles: { fillColor: [139, 92, 246], fontSize: 7, halign: 'center' },
    styles: { fontSize: n > 31 ? 5.5 : 6.5, cellPadding: 1, halign: 'center', lineColor: [150, 150, 150], lineWidth: 0.1 },
    columnStyles,
    margin: { left: ml, right: mr, top: 14, bottom: 14 },
    rowPageBreak: 'avoid',
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index < 3 || data.column.index >= 3 + n) return;
      const fill = STATUS_FILL[String(data.cell.raw)];
      if (fill) {
        data.cell.styles.fillColor = fill;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ---------- Keterangan + titimangsa + tanda tangan wali kelas ----------
  const sigW = 70;
  const sigGap = 16;
  const sigH = lineH * 2 + sigGap + lineH * 2 + 1;
  const blockH = Math.max(sigH, 38);
  let y = ((doc as any).lastAutoTable?.finalY ?? startY + 19) + 6;
  if (y + blockH > bottomLimit) {
    doc.addPage();
    setFont('italic', 8);
    doc.setTextColor(90, 90, 90);
    doc.text(`Lanjutan rekap kehadiran Kelas ${clean(opts.className) || '-'}`, ml, 10);
    y = 16;
  }
  const blockTop = y;

  // Keterangan (kiri)
  setFont('bold', 9);
  doc.text('Keterangan:', 14, blockTop + 3);
  setFont('normal', 8);
  (
    [
      ['H', 'Hadir'],
      ['S', 'Sakit'],
      ['I', 'Izin'],
      ['A', 'Alpa'],
    ] as const
  ).forEach(([code, label], i) => {
    const ly = blockTop + 6 + i * 6;
    doc.setFillColor(...STATUS_FILL[code]);
    doc.rect(14, ly, 5, 5, 'F');
    doc.text(`${code} = ${label}`, 21, ly + 4);
  });
  if (clean(opts.note)) {
    setFont('italic', 8);
    doc.text(clean(opts.note), 14, blockTop + 6 + 4 * 6 + 3);
  }

  // Titimangsa + tanda tangan (kanan)
  const sx = pw - mr - sigW;
  const dots = (w: number) => '.'.repeat(Math.max(3, Math.floor(w / Math.max(0.1, doc.getTextWidth('.')))));
  setFont('normal', 10);
  const place = clean(opts.place);
  const dateText = /^\d{4}-\d{2}-\d{2}$/.test(opts.signDate) ? formatIdDate(opts.signDate) : '';
  const dateLine = dateText ? `${place ? `${place}, ` : ''}${dateText}` : `${place ? `${place}, ` : ''}${dots(sigW - 4)}`;
  let sy = blockTop + 3;
  doc.text(dateLine, sx, sy);
  sy += lineH;
  doc.text('Wali Kelas,', sx, sy);
  sy += sigGap + lineH;
  const wali = clean(opts.homeroomName);
  if (wali) {
    setFont('bold', 10);
    doc.text(wali, sx, sy);
    setFont('normal', 10);
  } else {
    doc.text(dots(sigW - 6), sx, sy);
  }
  sy += lineH;
  const nip = clean(opts.homeroomNip);
  doc.text(`NIP. ${nip || dots(sigW - 12)}`, sx, sy);

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
